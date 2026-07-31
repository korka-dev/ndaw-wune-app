/**
 * Écran Ressources FLN
 * ─────────────────────────────────────────────────────────────────
 * - Liste les documents uploadés par l'admin (PDF, Excel, CSV, Word…)
 * - Téléchargement avec barre de progression (fichiers ~20 Mo)
 * - Mode hors-ligne : la liste est mise en cache, les docs téléchargés
 *   restent consultables sans connexion
 * - Viewer inline (AppHeader + tabs toujours visibles)
 *     PDF (iOS + Android) : react-native-pdf (local ou URL distante avec auth)
 *     Image               : React Native <Image>
 * - Word / Excel / CSV → app native (IntentLauncher / Share)
 */
import React, { useState, useCallback, useEffect } from "react";
import { trackUsage } from "../services/usage";
import {
  View,
  Text,
  Image,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  RefreshControl,
  ActivityIndicator,
  Alert,
  Platform,
  Share,
  Linking,
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { SafeAreaView } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
// Imports natifs conditionnels — évitent le crash si module non lié
let Pdf: React.ComponentType<any> | null = null;
try { Pdf = require("react-native-pdf").default; } catch {}
import * as FileSystem from "expo-file-system/legacy";
import * as IntentLauncher from "expo-intent-launcher";

import { rs, rf } from "../utils/responsive";
import { C } from "../utils/theme";
import AppHeader from "../components/AppHeader";
import ProfileSheet from "../components/ProfileSheet";
import TourTarget from "../components/TourTarget";
import { ressourcesApi } from "../services/api";
import { getSecure } from "../services/secureStorage";
import { useStore } from "../store/useStore";

// ── Constantes ─────────────────────────────────────────────────────────────────

const DOWNLOADS_KEY  = "@ressources_offline_v1";
const DOCS_CACHE_KEY = "@ressources_docs_list_v1";

// Timeout de stagnation : si aucun octet n'arrive pendant cette durée → connexion morte.
// NE PAS utiliser un timeout total fixe : sur réseau 2G sénégalais (~150 kbps),
// 20 Mo peut prendre 15-20 minutes. On annule uniquement si le transfert est bloqué.
const STALL_TIMEOUT_MS = 30_000; // 30 s sans aucune activité réseau

// ── Types ──────────────────────────────────────────────────────────────────────

type ResourceType = "document" | "video" | "autre";

type Document = {
  id: string;
  title: string;
  original_filename: string;
  mime_type: string;
  file_size: number;
  description: string | null;
  resource_type: ResourceType;
  created_at: string;
};

type DownloadState = "none" | "downloading" | "ready" | "unavailable";

type ViewerSource =
  | { kind: "pdf";   uri: string; authHeader?: string }
  | { kind: "image"; uri: string };

// ── Helpers ────────────────────────────────────────────────────────────────────

function formatSize(bytes: number): string {
  if (bytes === 0) return "0 o";
  if (bytes < 1024) return `${bytes} o`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} Ko`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} Mo`;
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString("fr-FR", {
      day: "2-digit", month: "short", year: "numeric",
    });
  } catch { return iso; }
}

type FileCategory = "pdf" | "excel" | "csv" | "word" | "image" | "other";

function getCategory(mime: string, filename: string): FileCategory {
  const ext = filename.split(".").pop()?.toLowerCase() ?? "";
  if (mime === "application/pdf" || ext === "pdf")                                                return "pdf";
  if (mime.includes("spreadsheet") || mime.includes("excel") || ext === "xlsx" || ext === "xls") return "excel";
  if (mime === "text/csv" || ext === "csv")                                                        return "csv";
  if (mime.includes("word") || ext === "doc" || ext === "docx")                                   return "word";
  if (mime.startsWith("image/"))                                                                   return "image";
  return "other";
}

function persistentUri(doc: Document): string {
  const ext = doc.original_filename.split(".").pop()?.toLowerCase() ?? "bin";
  return `${FileSystem.documentDirectory}ressource_${doc.id}.${ext}`;
}

const CAT_META: Record<FileCategory, {
  label: string; color: string; bg: string;
  icon: React.ComponentProps<typeof Feather>["name"];
}> = {
  pdf:   { label: "PDF",     color: "#C0392B", bg: "#FDECEA", icon: "file-text" },
  excel: { label: "Excel",   color: "#27AE60", bg: "#E8F8EF", icon: "grid"      },
  csv:   { label: "CSV",     color: "#27AE60", bg: "#E8F8EF", icon: "list"      },
  word:  { label: "Word",    color: "#2980B9", bg: "#EAF4FC", icon: "file-text" },
  image: { label: "Image",   color: "#8E44AD", bg: "#F5EEF8", icon: "image"     },
  other: { label: "Fichier", color: C.textMuted, bg: C.surfaceAlt, icon: "file" },
};

// ── Viewer inline ──────────────────────────────────────────────────────────────

function InlineViewer({
  doc,
  source,
  onClose,
  onOpenExternal,
}: {
  doc: Document;
  source: ViewerSource;
  onClose: () => void;
  onOpenExternal: () => void;
}) {
  const [loading,  setLoading]  = useState(true);
  const [page,     setPage]     = useState(1);
  const [total,    setTotal]    = useState(0);

  const pdfSource = source.kind === "pdf"
    ? {
        uri:     source.uri,
        cache:   true,
        ...(source.authHeader ? { headers: { Authorization: source.authHeader } } : {}),
      }
    : null;

  return (
    <View style={vw.wrap}>
      {/* Barre de navigation */}
      <View style={vw.bar}>
        <TouchableOpacity style={vw.backBtn} onPress={onClose}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Feather name="arrow-left" size={rf(18)} color={C.text} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={vw.barTitle} numberOfLines={1}>{doc.title}</Text>
          {source.kind === "pdf" && total > 0 && (
            <Text style={vw.barPage}>Page {page} / {total}</Text>
          )}
        </View>
        <TouchableOpacity style={vw.extBtn} onPress={onOpenExternal}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Feather name="external-link" size={rf(16)} color={C.textMuted} />
        </TouchableOpacity>
      </View>

      <View style={vw.content}>
        {source.kind === "image" ? (
          <Image source={{ uri: source.uri }} style={vw.image} resizeMode="contain" />
        ) : Pdf && pdfSource ? (
          <>
            {loading && (
              <View style={vw.overlay}>
                <ActivityIndicator size="large" color={C.brand} />
                <Text style={vw.overlayTxt}>Chargement du PDF…</Text>
              </View>
            )}
            <Pdf
              source={pdfSource}
              style={vw.pdf}
              enablePaging
              horizontal={false}
              trustAllCerts={false}
              onLoadComplete={(numberOfPages: number) => {
                setTotal(numberOfPages);
                setLoading(false);
              }}
              onPageChanged={(p: number) => setPage(p)}
              onError={() => {
                setLoading(false);
                Alert.alert("Erreur", "Impossible d'afficher ce PDF.");
              }}
            />
          </>
        ) : (
          <View style={vw.overlay}>
            <Feather name="file-text" size={rf(36)} color={C.textMuted} />
            <Text style={vw.overlayTxt}>
              Visualiseur PDF non disponible.{"\n"}Appuyez sur ↗ pour ouvrir dans une app externe.
            </Text>
          </View>
        )}
      </View>
    </View>
  );
}

// ── Carte document ─────────────────────────────────────────────────────────────

function DocCard({
  doc,
  dlState,
  progress,
  canViewOnline,
  onDownload,
  onOpen,
  onDeleteLocal,
}: {
  doc: Document;
  dlState: DownloadState;
  progress: number;
  canViewOnline: boolean;   // PDF + connecté → ouvrir directement sans DL
  onDownload: () => void;
  onOpen: () => void;
  onDeleteLocal: () => void;
}) {
  const cat  = getCategory(doc.mime_type, doc.original_filename);
  const meta = CAT_META[cat];
  const pct  = Math.round(progress * 100);

  return (
    <View style={[s.card, dlState === "unavailable" && !canViewOnline && s.cardUnavailable]}>
      <View style={[s.cardIcon, { backgroundColor: meta.bg }]}>
        <Feather name={meta.icon} size={rf(22)} color={meta.color} />
      </View>

      <View style={s.cardBody}>
        <Text style={s.cardTitle} numberOfLines={2}>{doc.title}</Text>
        <View style={s.cardRow}>
          <View style={[s.badge, { backgroundColor: meta.bg }]}>
            <Text style={[s.badgeTxt, { color: meta.color }]}>{meta.label}</Text>
          </View>
          <Text style={s.cardMeta}>{formatSize(doc.file_size)}</Text>
          <Text style={s.sep}>·</Text>
          <Text style={s.cardMeta}>{formatDate(doc.created_at)}</Text>
        </View>
        {doc.description ? (
          <Text style={s.cardDesc} numberOfLines={1}>{doc.description}</Text>
        ) : null}

        {dlState === "downloading" && (
          <View style={s.progressRow}>
            <View style={s.progressTrack}>
              <View style={[s.progressFill, { width: `${pct}%` as any }]} />
            </View>
            <Text style={s.progressPct}>{pct} %</Text>
          </View>
        )}

        {dlState === "ready" && (
          <View style={s.offlineBadge}>
            <Feather name="check-circle" size={rf(11)} color={C.success} />
            <Text style={s.offlineBadgeTxt}>Disponible hors-ligne</Text>
          </View>
        )}

        {dlState === "unavailable" && !canViewOnline && (
          <View style={s.offlineBadge}>
            <Feather name="wifi-off" size={rf(11)} color={C.textMuted} />
            <Text style={s.unavailableTxt}>Non disponible hors-ligne</Text>
          </View>
        )}
      </View>

      <View style={s.cardActions}>
        {dlState === "downloading" ? (
          <View style={[s.actionBtn, { backgroundColor: C.brandSoft }]}>
            <ActivityIndicator size="small" color={C.brand} />
          </View>
        ) : dlState === "ready" ? (
          <>
            <TouchableOpacity style={[s.actionBtn, { backgroundColor: meta.bg }]}
              onPress={onOpen} activeOpacity={0.75}>
              <Feather name="eye" size={rf(17)} color={meta.color} />
            </TouchableOpacity>
            <TouchableOpacity style={[s.actionBtn, { backgroundColor: C.surfaceAlt }]}
              onPress={onDeleteLocal} activeOpacity={0.75}>
              <Feather name="trash-2" size={rf(15)} color={C.textMuted} />
            </TouchableOpacity>
          </>
        ) : canViewOnline ? (
          /* PDF accessible en ligne — ouvrir directement + bouton DL séparé */
          <>
            <TouchableOpacity style={[s.actionBtn, { backgroundColor: meta.bg }]}
              onPress={onOpen} activeOpacity={0.75}>
              <Feather name="eye" size={rf(17)} color={meta.color} />
            </TouchableOpacity>
            <TouchableOpacity style={[s.actionBtn, { backgroundColor: C.brandSoft }]}
              onPress={onDownload} activeOpacity={0.75}>
              <Feather name="download" size={rf(15)} color={C.brand} />
            </TouchableOpacity>
          </>
        ) : dlState === "unavailable" ? (
          <View style={[s.actionBtn, { backgroundColor: C.surfaceAlt }]}>
            <Feather name="wifi-off" size={rf(15)} color={C.textMuted} />
          </View>
        ) : (
          <TouchableOpacity style={[s.actionBtn, { backgroundColor: C.brandSoft }]}
            onPress={onDownload} activeOpacity={0.75}>
            <Feather name="download" size={rf(17)} color={C.brand} />
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}

// ── Écran principal ────────────────────────────────────────────────────────────

export default function RessourcesScreen() {
  useEffect(() => { trackUsage("ressources").catch(() => {}); }, []);
  const isOnline = useStore(st => st.isOnline);
  const user     = useStore(st => st.user);

  const [docs,        setDocs]        = useState<Document[]>([]);
  const [fromCache,   setFromCache]   = useState(false);   // liste chargée depuis le cache
  const [loading,     setLoading]     = useState(true);
  const [refreshing,  setRefreshing]  = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [downloads,   setDownloads]   = useState<Record<string, string>>({});
  const [downloading, setDownloading] = useState<string | null>(null);
  const [progress,    setProgress]    = useState<Record<string, number>>({});
  const [activeType,  setActiveType]  = useState<"all" | ResourceType>("all");

  // Viewer
  const [activeDoc,    setActiveDoc]    = useState<Document | null>(null);
  const [viewerSource, setViewerSource] = useState<ViewerSource | null>(null);

  // ── Chargement des téléchargements persistés ──────────────────────────────
  useEffect(() => {
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(DOWNLOADS_KEY);
        if (!raw) return;
        const saved: Record<string, string> = JSON.parse(raw);
        const verified: Record<string, string> = {};
        await Promise.all(
          Object.entries(saved).map(async ([id, uri]) => {
            const info = await FileSystem.getInfoAsync(uri);
            if (info.exists) verified[id] = uri;
          })
        );
        setDownloads(verified);
        if (Object.keys(verified).length !== Object.keys(saved).length)
          await AsyncStorage.setItem(DOWNLOADS_KEY, JSON.stringify(verified));
      } catch (e) {
        console.warn("[Ressources] Chargement downloads:", e);
      }
    })();
  }, []);

  const saveDownloads = useCallback(async (updated: Record<string, string>) => {
    setDownloads(updated);
    await AsyncStorage.setItem(DOWNLOADS_KEY, JSON.stringify(updated));
  }, []);

  // ── Liste — avec cache hors-ligne ─────────────────────────────────────────
  const fetchDocs = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const { data } = await ressourcesApi.list();
      setDocs(data);
      setFromCache(false);
      // Mettre en cache pour la prochaine fois hors-ligne
      AsyncStorage.setItem(DOCS_CACHE_KEY, JSON.stringify(data)).catch(() => {});
    } catch {
      // Réseau indisponible → fallback cache
      try {
        const cached = await AsyncStorage.getItem(DOCS_CACHE_KEY);
        if (cached) {
          setDocs(JSON.parse(cached));
          setFromCache(true);
        } else if (!silent) {
          Alert.alert("Erreur", "Impossible de charger les ressources. Vérifiez votre connexion.");
        }
      } catch {
        if (!silent) Alert.alert("Erreur", "Impossible de charger les ressources.");
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { fetchDocs(); }, [fetchDocs]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    fetchDocs(true);
  }, [fetchDocs]);

  // ── Téléchargement avec progression ──────────────────────────────────────
  const handleDownload = useCallback(async (doc: Document) => {
    if (!isOnline) {
      Alert.alert("Hors-ligne", "Connectez-vous pour télécharger ce document.");
      return;
    }
    setDownloading(doc.id);
    setProgress(prev => ({ ...prev, [doc.id]: 0 }));
    const localUri = persistentUri(doc);

    let resumable: ReturnType<typeof FileSystem.createDownloadResumable> | null = null;
    // Timer de stagnation — réinitialisé à chaque chunk réseau reçu.
    // Permet de télécharger sur connexion 2G lente sans jamais annuler prématurément,
    // tout en détectant une connexion morte en 30 secondes.
    let stallTimer: ReturnType<typeof setTimeout> | null = null;
    let stallReject: ((e: Error) => void) | null = null;

    const resetStall = () => {
      if (stallTimer) clearTimeout(stallTimer);
      stallTimer = setTimeout(() => {
        resumable?.pauseAsync().catch(() => {});
        stallReject?.(new Error("stall"));
      }, STALL_TIMEOUT_MS);
    };

    try {
      const token = await getSecure("access_token");
      if (!token) { Alert.alert("Session expirée", "Reconnectez-vous."); return; }

      const result = await new Promise<FileSystem.FileSystemDownloadResult>((resolve, reject) => {
        stallReject = reject;

        resumable = FileSystem.createDownloadResumable(
          ressourcesApi.downloadUrl(doc.id),
          localUri,
          { headers: { Authorization: `Bearer ${token}` } },
          // Callback de progression — chaque chunk réinitialise le timer de stagnation
          (downloadProgress) => {
            resetStall(); // connexion active → on repart pour 30 s
            const total = downloadProgress.totalBytesExpectedToWrite;
            if (total > 0) {
              setProgress(prev => ({
                ...prev,
                [doc.id]: downloadProgress.totalBytesWritten / total,
              }));
            }
          },
        );

        // Démarre le timer : couvre aussi la phase de connexion initiale (DNS, handshake)
        resetStall();

        resumable.downloadAsync()
          .then(r => { if (stallTimer) clearTimeout(stallTimer); if (r) resolve(r); else reject(new Error("no_result")); })
          .catch(e => { if (stallTimer) clearTimeout(stallTimer); reject(e); });
      });

      if (!result || result.status !== 200) {
        await FileSystem.deleteAsync(localUri, { idempotent: true });
        Alert.alert("Erreur", `Téléchargement échoué (code ${result?.status ?? "?"}).`);
        return;
      }
      await saveDownloads({ ...downloads, [doc.id]: localUri });
    } catch (err: any) {
      resumable?.pauseAsync().catch(() => {});
      await FileSystem.deleteAsync(localUri, { idempotent: true }).catch(() => {});
      const isStall = (err as Error)?.message === "stall";
      Alert.alert(
        "Téléchargement interrompu",
        isStall
          ? "La connexion semble inactive (30 s sans activité). Réessayez dans une zone avec un meilleur réseau."
          : "Impossible de télécharger le document. Vérifiez votre connexion.",
      );
    } finally {
      if (stallTimer) clearTimeout(stallTimer);
      setProgress(prev => { const n = { ...prev }; delete n[doc.id]; return n; });
      setDownloading(null);
    }
  }, [isOnline, downloads, saveDownloads]);

  // ── Suppression locale ────────────────────────────────────────────────────
  const handleDeleteLocal = useCallback((doc: Document) => {
    Alert.alert(
      "Supprimer le fichier local",
      `Supprimer "${doc.title}" de l'appareil ?\nIl restera disponible en ligne.`,
      [
        { text: "Annuler", style: "cancel" },
        {
          text: "Supprimer", style: "destructive",
          onPress: async () => {
            const uri = downloads[doc.id];
            if (uri) await FileSystem.deleteAsync(uri, { idempotent: true }).catch(() => {});
            const updated = { ...downloads };
            delete updated[doc.id];
            await saveDownloads(updated);
          },
        },
      ],
    );
  }, [downloads, saveDownloads]);

  // ── Ouverture externe ─────────────────────────────────────────────────────
  const handleOpenExternal = useCallback(async (doc: Document) => {
    const localUri = downloads[doc.id];
    if (!localUri) return;
    try {
      const contentUri = await FileSystem.getContentUriAsync(localUri);
      await IntentLauncher.startActivityAsync("android.intent.action.VIEW", {
        data: contentUri, flags: 1,
        type: doc.mime_type || "application/pdf",
      });
    } catch {
      // Jeton de courte durée (2 min, scopé à ce document) — jamais le token
      // d'accès complet, pour limiter les dégâts si l'app externe le capture.
      try {
        const { data } = await ressourcesApi.getDownloadToken(doc.id);
        await Linking.openURL(
          `${ressourcesApi.downloadUrl(doc.id)}?access_token=${data.token}`
        ).catch(() => {});
      } catch {
        /* silencieux — pas de connexion ou session expirée */
      }
    }
  }, [downloads]);

  // ── Ouverture du viewer ───────────────────────────────────────────────────
  const handleOpen = useCallback(async (doc: Document) => {
    const localUri = downloads[doc.id];
    const cat = getCategory(doc.mime_type, doc.original_filename);

    // Word / Excel / CSV → app externe
    if (cat === "word" || cat === "excel" || cat === "csv") {
      if (localUri) {
        if (Platform.OS === "ios") {
          await Share.share({ url: localUri, title: doc.title }).catch(() => {});
        } else {
          await handleOpenExternal(doc);
        }
      }
      return;
    }

    // Image
    if (cat === "image") {
      if (localUri) {
        setViewerSource({ kind: "image", uri: localUri });
        setActiveDoc(doc);
      }
      return;
    }

    // PDF — local en priorité, sinon URL distante avec auth
    if (localUri) {
      const pdfUri = localUri.startsWith("file://") ? localUri : `file://${localUri}`;
      setViewerSource({ kind: "pdf", uri: pdfUri });
      setActiveDoc(doc);
      return;
    }

    // PDF distant (pas encore téléchargé)
    const token = await getSecure("access_token").catch(() => null);
    if (!token) { Alert.alert("Session expirée", "Reconnectez-vous."); return; }
    setViewerSource({
      kind: "pdf",
      uri: ressourcesApi.downloadUrl(doc.id),
      authHeader: `Bearer ${token}`,
    });
    setActiveDoc(doc);
  }, [downloads, handleOpenExternal]);

  const closeViewer = useCallback(() => {
    setActiveDoc(null);
    setViewerSource(null);
  }, []);

  const dlStateOf = useCallback((id: string): DownloadState => {
    if (downloading === id)       return "downloading";
    if (downloads[id])            return "ready";
    if (!isOnline)                return "unavailable";  // offline + non téléchargé
    return "none";
  }, [downloading, downloads, isOnline]);

  const nbOffline = Object.keys(downloads).length;

  const visibleDocs = activeType === "all"
    ? docs
    : docs.filter(d => (d.resource_type ?? "document") === activeType);

  const typeCounts: Record<"all" | ResourceType, number> = {
    all:      docs.length,
    document: docs.filter(d => !d.resource_type || d.resource_type === "document").length,
    video:    docs.filter(d => d.resource_type === "video").length,
    autre:    docs.filter(d => d.resource_type === "autre").length,
  };

  const TYPE_CARDS: { key: "all" | ResourceType; label: string; icon: React.ComponentProps<typeof Feather>["name"]; color: string; bg: string }[] = [
    { key: "all",      label: "Tous",      icon: "layers",    color: C.brand,    bg: C.brandSoft },
    { key: "document", label: "Documents", icon: "file-text", color: "#C0392B",  bg: "#FDECEA" },
    { key: "video",    label: "Vidéos",    icon: "play-circle", color: "#8E44AD", bg: "#F5EEF8" },
    { key: "autre",    label: "Autres",    icon: "folder",    color: "#27AE60",  bg: "#E8F8EF" },
  ];

  // ── Rendu ─────────────────────────────────────────────────────────────────
  return (
    <SafeAreaView style={s.safe} edges={[]}>
      <AppHeader
        userName={user?.name ?? ""}
        onAvatarPress={() => setProfileOpen(true)}
        onSyncPress={() => { setRefreshing(true); fetchDocs(true); }}
        syncing={refreshing}
        isOnline={isOnline}
      />

      {activeDoc && viewerSource ? (
        <InlineViewer
          doc={activeDoc}
          source={viewerSource}
          onClose={closeViewer}
          onOpenExternal={() => handleOpenExternal(activeDoc)}
        />
      ) : (
        <ScrollView
          style={s.scroll}
          contentContainerStyle={s.content}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh}
              colors={[C.brand]} tintColor={C.brand} />
          }
          showsVerticalScrollIndicator={false}
        >
          <View style={s.pageHeader}>
            <Text style={s.pageTitle}>Ressources FLN</Text>
            <Text style={s.pageSubtitle}>Bibliothèque pédagogique ARED</Text>
          </View>

          {/* Bandeau hors-ligne */}
          {!isOnline && (
            <View style={s.offlineBanner}>
              <Feather name="wifi-off" size={rf(13)} color={C.textMuted} />
              <Text style={s.offlineBannerTxt}>
                {nbOffline > 0
                  ? `Mode hors-ligne · ${nbOffline} document${nbOffline > 1 ? "s" : ""} disponible${nbOffline > 1 ? "s" : ""}`
                  : "Mode hors-ligne · Aucun document téléchargé"}
              </Text>
            </View>
          )}

          {/* Indice téléchargement — uniquement en ligne */}
          {isOnline && !loading && docs.length > 0 && (
            <TourTarget id="ressources.liste" style={s.hintRow}>
              <Feather name="info" size={rf(11)} color={C.textMuted} />
              <Text style={s.hintTxt}>
                Appuyez sur <Text style={{ color: C.brand, fontWeight: "700" }}>↓</Text> pour
                télécharger et consulter hors-ligne.
              </Text>
            </TourTarget>
          )}

          {/* Grille de types */}
          {!loading && docs.length > 0 && (
            <View style={s.typeGrid}>
              {TYPE_CARDS.map(card => {
                const isActive = activeType === card.key;
                const count = typeCounts[card.key];
                return (
                  <TouchableOpacity
                    key={card.key}
                    onPress={() => setActiveType(card.key)}
                    style={[s.typeCard, isActive && s.typeCardActive]}
                    activeOpacity={0.8}
                  >
                    <View style={[s.typeCardIcon, { backgroundColor: isActive ? card.color : card.bg }]}>
                      <Feather name={card.icon} size={rf(14)} color={isActive ? "#fff" : card.color} />
                    </View>
                    <Text style={[s.typeCardLabel, isActive && s.typeCardLabelActive]} numberOfLines={1}>
                      {card.label}
                    </Text>
                    <View style={[s.typeCardCount, isActive && s.typeCardCountActive]}>
                      <Text style={[s.typeCardCountTxt, isActive && s.typeCardCountTxtActive]}>
                        {count}
                      </Text>
                    </View>
                  </TouchableOpacity>
                );
              })}
            </View>
          )}

          {loading ? (
            <View style={s.centered}>
              <ActivityIndicator size="large" color={C.brand} />
              <Text style={s.loadingTxt}>Chargement…</Text>
            </View>
          ) : docs.length === 0 ? (
            <View style={s.empty}>
              <View style={[s.emptyIcon, { backgroundColor: C.surfaceAlt }]}>
                <Feather name={isOnline ? "inbox" : "wifi-off"} size={rf(36)} color={C.textMuted} />
              </View>
              <Text style={s.emptyTitle}>
                {isOnline ? "Aucun document disponible" : "Aucun document hors-ligne"}
              </Text>
              <Text style={s.emptySub}>
                {isOnline
                  ? "Les ressources partagées par l'équipe ARED apparaîtront ici."
                  : "Connectez-vous et téléchargez des documents pour les consulter sans connexion."}
              </Text>
            </View>
          ) : (
            <>
              <Text style={s.countLabel}>
                {visibleDocs.length} ressource{visibleDocs.length > 1 ? "s" : ""}
                {nbOffline > 0 ? `  ·  ${nbOffline} hors-ligne` : ""}
                {fromCache && !isOnline ? "  ·  cache local" : ""}
              </Text>
              {visibleDocs.map(doc => {
                const cat = getCategory(doc.mime_type, doc.original_filename);
                return (
                  <DocCard
                    key={doc.id}
                    doc={doc}
                    dlState={dlStateOf(doc.id)}
                    progress={progress[doc.id] ?? 0}
                    canViewOnline={isOnline && cat === "pdf"}
                    onDownload={() => handleDownload(doc)}
                    onOpen={() => handleOpen(doc)}
                    onDeleteLocal={() => handleDeleteLocal(doc)}
                  />
                );
              })}
            </>
          )}
        </ScrollView>
      )}

      <ProfileSheet visible={profileOpen} onClose={() => setProfileOpen(false)} />
    </SafeAreaView>
  );
}

// ── Styles viewer ──────────────────────────────────────────────────────────────

const vw = StyleSheet.create({
  wrap:       { flex: 1, backgroundColor: C.bg },
  bar:        {
    flexDirection: "row", alignItems: "center",
    backgroundColor: C.surface,
    paddingHorizontal: rs(12), paddingVertical: rs(10),
    borderBottomWidth: 1, borderBottomColor: C.border, gap: rs(8),
  },
  backBtn:    {
    width: rs(36), height: rs(36), borderRadius: rs(10),
    backgroundColor: C.surfaceAlt, alignItems: "center", justifyContent: "center",
  },
  extBtn:     {
    width: rs(36), height: rs(36), borderRadius: rs(10),
    backgroundColor: C.surfaceAlt, alignItems: "center", justifyContent: "center",
  },
  barTitle:   { fontSize: rf(15), fontWeight: "700", color: C.text },
  barPage:    { fontSize: rf(11), color: C.textMuted, marginTop: rs(1) },
  content:    { flex: 1 },
  image:      { flex: 1, backgroundColor: "#000" },
  pdf:        { flex: 1, width: "100%" },
  overlay:    {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center", justifyContent: "center",
    backgroundColor: C.bg, zIndex: 10, gap: rs(12),
  },
  overlayTxt: { fontSize: rf(13), color: C.textMuted, textAlign: "center" },
});

// ── Styles écran ───────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  safe:    { flex: 1, backgroundColor: C.bg },
  scroll:  { flex: 1 },
  content: { padding: rs(16), paddingBottom: rs(48) },

  pageHeader:   { marginBottom: rs(16) },
  pageTitle:    { fontSize: rf(22), fontWeight: "800", color: C.text },
  pageSubtitle: { fontSize: rf(14), color: C.textMuted, marginTop: rs(2) },

  offlineBanner: {
    flexDirection: "row", alignItems: "center", gap: rs(8),
    backgroundColor: C.surfaceAlt, borderRadius: rs(10),
    paddingHorizontal: rs(12), paddingVertical: rs(8),
    marginBottom: rs(14),
    borderWidth: 1, borderColor: C.border,
  },
  offlineBannerTxt: { flex: 1, fontSize: rf(12), color: C.textMuted, fontWeight: "600" },

  hintRow: { flexDirection: "row", alignItems: "center", gap: rs(6), marginBottom: rs(14) },
  hintTxt: { flex: 1, fontSize: rf(12), color: C.textMuted, lineHeight: rf(17) },

  typeGrid:            { flexDirection: "row", flexWrap: "wrap", gap: rs(8), marginBottom: rs(14) },
  typeCard:            {
    width: "47%", backgroundColor: C.surface, borderRadius: rs(10),
    borderWidth: 1.5, borderColor: C.border,
    paddingVertical: rs(8), paddingHorizontal: rs(8),
    alignItems: "center", gap: rs(5),
  },
  typeCardActive:      { borderColor: C.brand, backgroundColor: C.brandSoft },
  typeCardIcon:        { width: rs(30), height: rs(30), borderRadius: rs(8), alignItems: "center", justifyContent: "center" },
  typeCardLabel:       { fontSize: rf(11), fontWeight: "700", color: C.text },
  typeCardLabelActive: { color: C.brand },
  typeCardCount:       { backgroundColor: C.surfaceAlt, borderRadius: rs(8), minWidth: rs(22), height: rs(18), alignItems: "center", justifyContent: "center", paddingHorizontal: rs(5) },
  typeCardCountActive: { backgroundColor: C.brand },
  typeCardCountTxt:    { fontSize: rf(10), fontWeight: "800", color: C.textMuted },
  typeCardCountTxtActive: { color: "#fff" },

  countLabel: {
    fontSize: rf(12), fontWeight: "600", color: C.textMuted,
    textTransform: "uppercase", letterSpacing: 0.5, marginBottom: rs(10),
  },

  // ── Carte ──
  card: {
    flexDirection: "row", alignItems: "center", gap: rs(12),
    backgroundColor: C.surface, borderRadius: rs(14),
    padding: rs(14), marginBottom: rs(10),
    borderWidth: 1, borderColor: C.border,
  },
  cardUnavailable: { opacity: 0.6 },
  cardIcon:        { width: rs(46), height: rs(46), borderRadius: rs(12), alignItems: "center", justifyContent: "center", flexShrink: 0 },
  cardBody:        { flex: 1, gap: rs(4) },
  cardTitle:       { fontSize: rf(14), fontWeight: "600", color: C.text, lineHeight: rf(20) },
  cardTitleMuted:  { color: C.textMuted },
  cardRow:         { flexDirection: "row", alignItems: "center", gap: rs(6), flexWrap: "wrap" },
  badge:           { paddingHorizontal: rs(7), paddingVertical: rs(2), borderRadius: rs(5) },
  badgeTxt:        { fontSize: rf(11), fontWeight: "700" },
  cardMeta:        { fontSize: rf(12), color: C.textMuted },
  sep:             { fontSize: rf(12), color: C.border },
  cardDesc:        { fontSize: rf(12), color: C.textMuted },

  // Barre de progression
  progressRow:  { flexDirection: "row", alignItems: "center", gap: rs(8), marginTop: rs(4) },
  progressTrack: {
    flex: 1, height: rs(5), borderRadius: rs(3),
    backgroundColor: C.border, overflow: "hidden",
  },
  progressFill: {
    height: "100%", borderRadius: rs(3),
    backgroundColor: C.brand,
  },
  progressPct: { fontSize: rf(11), fontWeight: "700", color: C.brand, minWidth: rs(30), textAlign: "right" },

  offlineBadge:    { flexDirection: "row", alignItems: "center", gap: rs(4), marginTop: rs(2) },
  offlineBadgeTxt: { fontSize: rf(11), color: C.success, fontWeight: "600" },
  unavailableTxt:  { fontSize: rf(11), color: C.textMuted, fontWeight: "500" },

  cardActions: { flexDirection: "column", gap: rs(6), flexShrink: 0 },
  actionBtn:   { width: rs(36), height: rs(36), borderRadius: rs(10), alignItems: "center", justifyContent: "center" },

  centered:   { alignItems: "center", justifyContent: "center", paddingVertical: rs(60), gap: rs(12) },
  loadingTxt: { fontSize: rf(14), color: C.textMuted },
  empty:      { alignItems: "center", paddingVertical: rs(60), gap: rs(12) },
  emptyIcon:  { width: rs(70), height: rs(70), borderRadius: rs(20), alignItems: "center", justifyContent: "center", marginBottom: rs(4) },
  emptyTitle: { fontSize: rf(15), fontWeight: "600", color: C.text, textAlign: "center" },
  emptySub:   { fontSize: rf(13), color: C.textMuted, textAlign: "center", maxWidth: rs(280), lineHeight: rf(20) },
});
