/**
 * Écran Ressources FLN
 * ─────────────────────────────────────────────────────────────────
 * - Liste les documents uploadés par l'admin (PDF, Excel, CSV, Word…)
 * - Téléchargement explicite → stockage persistant (documentDirectory)
 * - Viewer inline (AppHeader + tabs toujours visibles)
 *     PDF   : react-native-pdf (rendu natif iOS + Android, hors-ligne, tout format)
 *     Image : React Native <Image>
 * - Word / Excel / CSV → app native (IntentLauncher / Share)
 * - Guard hors-ligne
 */
import React, { useState, useCallback, useEffect } from "react";
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
import Pdf from "react-native-pdf";
import * as FileSystem from "expo-file-system/legacy";
import * as IntentLauncher from "expo-intent-launcher";

import { rs, rf } from "../utils/responsive";
import { C } from "../utils/theme";
import AppHeader from "../components/AppHeader";
import ProfileSheet from "../components/ProfileSheet";
import { ressourcesApi } from "../services/api";
import { getSecure } from "../services/secureStorage";
import { useStore } from "../store/useStore";

// ── Constantes ─────────────────────────────────────────────────────────────────

const DOWNLOADS_KEY = "@ressources_offline_v1";

// ── Types ──────────────────────────────────────────────────────────────────────

type Document = {
  id: string;
  title: string;
  original_filename: string;
  mime_type: string;
  file_size: number;
  description: string | null;
  created_at: string;
};

type DownloadState = "none" | "downloading" | "ready";

type ViewerSource =
  | { kind: "pdf";   uri: string }   // react-native-pdf (iOS + Android natif)
  | { kind: "image"; uri: string };  // Image React Native

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
  const [loading,  setLoading]  = useState(source.kind === "pdf");
  const [pageInfo, setPageInfo] = useState({ current: 1, total: 0 });

  return (
    <View style={vw.wrap}>
      {/* Barre retour */}
      <View style={vw.bar}>
        <TouchableOpacity style={vw.backBtn} onPress={onClose}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Feather name="arrow-left" size={rf(18)} color={C.text} />
        </TouchableOpacity>

        <Text style={vw.barTitle} numberOfLines={1}>{doc.title}</Text>

        {/* Compteur de pages PDF */}
        {source.kind === "pdf" && pageInfo.total > 1 && (
          <Text style={vw.pageCounter}>{pageInfo.current} / {pageInfo.total}</Text>
        )}

        {/* Ouvrir avec une autre app */}
        <TouchableOpacity style={vw.extBtn} onPress={onOpenExternal}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Feather name="external-link" size={rf(16)} color={C.textMuted} />
        </TouchableOpacity>
      </View>

      {/* Contenu */}
      <View style={vw.content}>
        {source.kind === "image" ? (
          <Image source={{ uri: source.uri }} style={vw.image} resizeMode="contain" />
        ) : (
          <>
            {loading && (
              <View style={vw.overlay}>
                <ActivityIndicator size="large" color={C.brand} />
                <Text style={vw.overlayTxt}>Chargement du document…</Text>
              </View>
            )}
            <Pdf
              source={{ uri: source.uri, cache: false }}
              style={vw.pdf}
              fitPolicy={0}
              spacing={8}
              onLoadComplete={(numPages) => {
                setPageInfo({ current: 1, total: numPages });
                setLoading(false);
              }}
              onPageChanged={(page) => {
                setPageInfo(p => ({ ...p, current: page }));
              }}
              onError={(err) => {
                console.error("[Ressources] PDF render:", err);
                setLoading(false);
                Alert.alert("Erreur", "Impossible d'afficher ce document.");
              }}
            />
          </>
        )}
      </View>
    </View>
  );
}

// ── Carte document ─────────────────────────────────────────────────────────────

function DocCard({
  doc,
  dlState,
  onDownload,
  onOpen,
  onDeleteLocal,
}: {
  doc: Document;
  dlState: DownloadState;
  onDownload: () => void;
  onOpen: () => void;
  onDeleteLocal: () => void;
}) {
  const cat  = getCategory(doc.mime_type, doc.original_filename);
  const meta = CAT_META[cat];

  return (
    <View style={s.card}>
      <View style={[s.cardIcon, { backgroundColor: meta.bg }]}>
        <Feather name={meta.icon} size={22} color={meta.color} />
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
        {dlState === "ready" && (
          <View style={s.offlineBadge}>
            <Feather name="check-circle" size={rf(11)} color={C.success} />
            <Text style={s.offlineBadgeTxt}>Disponible hors-ligne</Text>
          </View>
        )}
      </View>

      <View style={s.cardActions}>
        {dlState === "ready" ? (
          <>
            <TouchableOpacity style={[s.actionBtn, { backgroundColor: meta.bg }]}
              onPress={onOpen} activeOpacity={0.75}>
              <Feather name="eye" size={17} color={meta.color} />
            </TouchableOpacity>
            <TouchableOpacity style={[s.actionBtn, { backgroundColor: C.surfaceAlt }]}
              onPress={onDeleteLocal} activeOpacity={0.75}>
              <Feather name="trash-2" size={15} color={C.textMuted} />
            </TouchableOpacity>
          </>
        ) : dlState === "downloading" ? (
          <View style={[s.actionBtn, { backgroundColor: C.brandSoft }]}>
            <ActivityIndicator size="small" color={C.brand} />
          </View>
        ) : (
          <TouchableOpacity style={[s.actionBtn, { backgroundColor: C.brandSoft }]}
            onPress={onDownload} activeOpacity={0.75}>
            <Feather name="download" size={17} color={C.brand} />
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}

// ── Écran principal ────────────────────────────────────────────────────────────

export default function RessourcesScreen() {
  const isOnline = useStore(st => st.isOnline);

  const [docs,        setDocs]        = useState<Document[]>([]);
  const [loading,     setLoading]     = useState(true);
  const [refreshing,  setRefreshing]  = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [downloads,   setDownloads]   = useState<Record<string, string>>({});
  const [downloading, setDownloading] = useState<string | null>(null);

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

  // ── Liste ─────────────────────────────────────────────────────────────────
  const fetchDocs = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const { data } = await ressourcesApi.list();
      setDocs(data);
    } catch {
      if (!silent) Alert.alert("Erreur", "Impossible de charger les ressources.");
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

  // ── Téléchargement ────────────────────────────────────────────────────────
  const handleDownload = useCallback(async (doc: Document) => {
    if (!isOnline) {
      Alert.alert("Hors-ligne", "Connectez-vous pour télécharger ce document.");
      return;
    }
    setDownloading(doc.id);
    const localUri = persistentUri(doc);
    try {
      const token = await getSecure("access_token");
      if (!token) { Alert.alert("Session expirée", "Reconnectez-vous."); return; }
      const result = await FileSystem.downloadAsync(
        ressourcesApi.downloadUrl(doc.id), localUri,
        { headers: { Authorization: `Bearer ${token}` } },
      );
      if (result.status !== 200) {
        await FileSystem.deleteAsync(localUri, { idempotent: true });
        Alert.alert("Erreur", `Téléchargement échoué (code ${result.status}).`);
        return;
      }
      await saveDownloads({ ...downloads, [doc.id]: localUri });
    } catch (err: any) {
      console.error("[Ressources] download:", err);
      await FileSystem.deleteAsync(localUri, { idempotent: true }).catch(() => {});
      Alert.alert("Erreur réseau", "Impossible de télécharger le document.");
    } finally {
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

  // ── Ouverture externe (IntentLauncher / URL serveur) ──────────────────────
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
      const token = await getSecure("access_token").catch(() => null);
      if (token) {
        await Linking.openURL(
          `${ressourcesApi.downloadUrl(doc.id)}?access_token=${token}`
        ).catch(() => {});
      }
    }
  }, [downloads]);

  // ── Ouverture du viewer ───────────────────────────────────────────────────
  const handleOpen = useCallback(async (doc: Document) => {
    const localUri = downloads[doc.id];
    if (!localUri) return;

    const cat = getCategory(doc.mime_type, doc.original_filename);

    // Word / Excel / CSV → application native
    if (cat === "word" || cat === "excel" || cat === "csv") {
      if (Platform.OS === "ios") {
        await Share.share({ url: localUri, title: doc.title }).catch(() => {});
      } else {
        await handleOpenExternal(doc);
      }
      return;
    }

    // Image → affichage React Native
    if (cat === "image") {
      setViewerSource({ kind: "image", uri: localUri });
      setActiveDoc(doc);
      return;
    }

    // PDF → react-native-pdf (rendu natif, iOS + Android, hors-ligne)
    // Assure le préfixe file:// requis par react-native-pdf
    const pdfUri = localUri.startsWith("file://") ? localUri : `file://${localUri}`;
    setViewerSource({ kind: "pdf", uri: pdfUri });
    setActiveDoc(doc);
  }, [downloads, handleOpenExternal]);

  const closeViewer = useCallback(() => {
    setActiveDoc(null);
    setViewerSource(null);
  }, []);

  const dlStateOf = useCallback((id: string): DownloadState => {
    if (downloading === id) return "downloading";
    if (downloads[id])      return "ready";
    return "none";
  }, [downloading, downloads]);

  // ── Rendu ─────────────────────────────────────────────────────────────────
  return (
    <SafeAreaView style={s.safe} edges={[]}>
      <AppHeader
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

          {!loading && docs.length > 0 && (
            <View style={s.hintRow}>
              <Feather name="info" size={rf(11)} color={C.textMuted} />
              <Text style={s.hintTxt}>
                Appuyez sur <Text style={{ color: C.brand, fontWeight: "700" }}>↓</Text> pour
                télécharger et consulter hors-ligne.
              </Text>
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
                <Feather name="inbox" size={36} color={C.textMuted} />
              </View>
              <Text style={s.emptyTitle}>Aucun document disponible</Text>
              <Text style={s.emptySub}>
                Les ressources partagées par l'équipe ARED apparaîtront ici.
              </Text>
            </View>
          ) : (
            <>
              <Text style={s.countLabel}>
                {docs.length} document{docs.length > 1 ? "s" : ""}
                {Object.keys(downloads).length > 0
                  ? `  ·  ${Object.keys(downloads).length} hors-ligne`
                  : ""}
              </Text>
              {docs.map(doc => (
                <DocCard
                  key={doc.id}
                  doc={doc}
                  dlState={dlStateOf(doc.id)}
                  onDownload={() => handleDownload(doc)}
                  onOpen={() => handleOpen(doc)}
                  onDeleteLocal={() => handleDeleteLocal(doc)}
                />
              ))}
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
  wrap:        { flex: 1, backgroundColor: C.bg },
  bar:         {
    flexDirection: "row", alignItems: "center",
    backgroundColor: C.surface,
    paddingHorizontal: rs(12), paddingVertical: rs(10),
    borderBottomWidth: 1, borderBottomColor: C.border, gap: rs(8),
  },
  backBtn:     {
    width: rs(36), height: rs(36), borderRadius: rs(10),
    backgroundColor: C.surfaceAlt, alignItems: "center", justifyContent: "center",
  },
  extBtn:      {
    width: rs(36), height: rs(36), borderRadius: rs(10),
    backgroundColor: C.surfaceAlt, alignItems: "center", justifyContent: "center",
  },
  barTitle:    { flex: 1, fontSize: rf(15), fontWeight: "700", color: C.text },
  pageCounter: { fontSize: rf(12), color: C.textMuted, fontWeight: "600" },
  content:     { flex: 1 },
  image:       { flex: 1, backgroundColor: "#000" },
  pdf:         { flex: 1, width: "100%" },
  overlay:     {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center", justifyContent: "center",
    backgroundColor: C.bg, zIndex: 10, gap: rs(12),
  },
  overlayTxt:  { fontSize: rf(13), color: C.textMuted, textAlign: "center" },
});

// ── Styles écran ───────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  safe:    { flex: 1, backgroundColor: C.bg },
  scroll:  { flex: 1 },
  content: { padding: rs(16), paddingBottom: rs(48) },

  pageHeader:   { marginBottom: rs(16) },
  pageTitle:    { fontSize: rf(22), fontWeight: "800", color: C.text },
  pageSubtitle: { fontSize: rf(14), color: C.textMuted, marginTop: rs(2) },

  hintRow: { flexDirection: "row", alignItems: "center", gap: rs(6), marginBottom: rs(14) },
  hintTxt: { flex: 1, fontSize: rf(12), color: C.textMuted, lineHeight: rf(17) },

  countLabel: {
    fontSize: rf(12), fontWeight: "600", color: C.textMuted,
    textTransform: "uppercase", letterSpacing: 0.5, marginBottom: rs(10),
  },

  card: {
    flexDirection: "row", alignItems: "center", gap: rs(12),
    backgroundColor: C.surface, borderRadius: rs(14),
    padding: rs(14), marginBottom: rs(10),
    borderWidth: 1, borderColor: C.border,
  },
  cardIcon:        { width: rs(46), height: rs(46), borderRadius: rs(12), alignItems: "center", justifyContent: "center", flexShrink: 0 },
  cardBody:        { flex: 1, gap: rs(5) },
  cardTitle:       { fontSize: rf(14), fontWeight: "600", color: C.text, lineHeight: rf(20) },
  cardRow:         { flexDirection: "row", alignItems: "center", gap: rs(6), flexWrap: "wrap" },
  badge:           { paddingHorizontal: rs(7), paddingVertical: rs(2), borderRadius: rs(5) },
  badgeTxt:        { fontSize: rf(11), fontWeight: "700" },
  cardMeta:        { fontSize: rf(12), color: C.textMuted },
  sep:             { fontSize: rf(12), color: C.border },
  cardDesc:        { fontSize: rf(12), color: C.textMuted },
  offlineBadge:    { flexDirection: "row", alignItems: "center", gap: rs(4), marginTop: rs(2) },
  offlineBadgeTxt: { fontSize: rf(11), color: C.success, fontWeight: "600" },
  cardActions:     { flexDirection: "column", gap: rs(6), flexShrink: 0 },
  actionBtn:       { width: rs(36), height: rs(36), borderRadius: rs(10), alignItems: "center", justifyContent: "center" },

  centered:   { alignItems: "center", justifyContent: "center", paddingVertical: rs(60), gap: rs(12) },
  loadingTxt: { fontSize: rf(14), color: C.textMuted },
  empty:      { alignItems: "center", paddingVertical: rs(60), gap: rs(12) },
  emptyIcon:  { width: rs(70), height: rs(70), borderRadius: rs(20), alignItems: "center", justifyContent: "center", marginBottom: rs(4) },
  emptyTitle: { fontSize: rf(15), fontWeight: "600", color: C.text, textAlign: "center" },
  emptySub:   { fontSize: rf(13), color: C.textMuted, textAlign: "center", maxWidth: rs(280), lineHeight: rf(20) },
});
