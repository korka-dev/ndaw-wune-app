import React, { useState } from "react";
import { View, Text, ScrollView, TouchableOpacity, TextInput, StyleSheet, Modal, ActivityIndicator } from "react-native";
import { Feather } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useStore } from "../../store/useStore";
import { C } from "../../utils/theme";
import { rf, rs } from "../../utils/responsive";

const BILANS = ["Bien", "Moyen", "Difficile"] as const;
type Bilan = typeof BILANS[number];

interface Rapport {
  id: number; date: string; heure: string; status: "ok" | "fail";
  profsPresents: number | null; classesTerminees: number | null;
  incidents: boolean | null; bilan: Bilan | null; commentaire: string;
}

const DEMO_HISTORY: Rapport[] = [
  { id:1, date:"Lundi 28 avr",    heure:"18h30", status:"ok",   profsPresents:5, classesTerminees:5, incidents:false, bilan:"Bien",   commentaire:"Journée productive." },
  { id:2, date:"Vendredi 25 avr", heure:"17h45", status:"ok",   profsPresents:4, classesTerminees:3, incidents:true,  bilan:"Moyen",  commentaire:"Un prof absent." },
  { id:3, date:"Mercredi 23 avr", heure:"—",     status:"fail", profsPresents:null, classesTerminees:null, incidents:null, bilan:null, commentaire:"" },
];

export default function SupRapportsScreen() {
  const insets = useSafeAreaInsets();
  const { user } = useStore();
  const [history,    setHistory]    = useState<Rapport[]>(DEMO_HISTORY);
  const [showForm,   setShowForm]   = useState(false);
  const [detail,     setDetail]     = useState<Rapport | null>(null);
  const [sending,    setSending]    = useState(false);
  const [sent,       setSent]       = useState(false);
  const [profsPresents,    setProfsPresents]    = useState(4);
  const [classesTerminees, setClassesTerminees] = useState(4);
  const [incidents,        setIncidents]        = useState<boolean | null>(null);
  const [bilan,            setBilan]            = useState<Bilan | null>(null);
  const [commentaire,      setCommentaire]      = useState("");

  const canSend = incidents !== null && bilan !== null;
  const okCount = history.filter(r => r.status === "ok").length;
  const failCount = history.filter(r => r.status === "fail").length;
  const bilanColor: Record<Bilan, string> = { Bien:C.success, Moyen:C.warn, Difficile:C.danger };

  const handleSend = () => {
    setSending(true);
    setTimeout(() => {
      const now = new Date();
      setHistory(h => [{ id:Date.now(), date:"Mardi 28 avr", heure:`${now.getHours()}h${String(now.getMinutes()).padStart(2,"0")}`, status:"ok", profsPresents, classesTerminees, incidents, bilan, commentaire }, ...h]);
      setSending(false); setShowForm(false); setSent(true);
      setProfsPresents(4); setClassesTerminees(4); setIncidents(null); setBilan(null); setCommentaire("");
      setTimeout(() => setSent(false), 3000);
    }, 1400);
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top + rs(12) }]}>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        {sent && (
          <View style={styles.sentBanner}>
            <Feather name="check" size={rs(16)} color={C.success} />
            <Text style={styles.sentText}>Rapport envoyé avec succès !</Text>
          </View>
        )}
        <View style={styles.statsRow}>
          <View style={[styles.statCard, { backgroundColor:C.successSoft }]}>
            <Text style={[styles.statValue, { color:C.success }]}>{okCount}</Text>
            <Text style={[styles.statLabel, { color:C.success }]}>Envoyé avec succès</Text>
          </View>
          <View style={[styles.statCard, { backgroundColor:C.dangerSoft }]}>
            <Text style={[styles.statValue, { color:C.danger }]}>{failCount}</Text>
            <Text style={[styles.statLabel, { color:C.danger }]}>Non envoyé</Text>
          </View>
        </View>

        <TouchableOpacity onPress={() => setShowForm(true)} style={styles.sendBtn}>
          <Feather name="send" size={rs(16)} color="#fff" />
          <Text style={styles.sendBtnText}>Envoyer le rapport du jour</Text>
        </TouchableOpacity>

        <View style={styles.histCard}>
          <Text style={styles.histTitle}>5 derniers rapports</Text>
          {history.slice(0, 5).map((r, i) => {
            const ok = r.status === "ok";
            return (
              <TouchableOpacity key={r.id} onPress={() => setDetail(r)}
                style={[styles.histRow, i < Math.min(history.length, 5) - 1 && styles.histBorder, !ok && styles.histFail]}>
                <View style={[styles.histIcon, !ok && styles.histIconFail]}>
                  <Feather name={ok ? "check" : "alert-triangle"} size={rs(13)} color={ok ? C.success : "#EF4444"} />
                </View>
                <View style={{ flex:1 }}>
                  <Text style={[styles.histDate, !ok && { color:"#B91C1C" }]}>{r.date}</Text>
                  <Text style={[styles.histSub, !ok && { color:"#EF4444" }]}>{ok ? `Rapport envoyé · ${r.heure}` : "⚠ Envoi échoué — à renvoyer"}</Text>
                </View>
                <Text style={[styles.histBtn, !ok && { color:"#EF4444" }]}>Détail</Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </ScrollView>

      {/* Form modal */}
      <Modal visible={showForm} animationType="slide" transparent>
        <View style={styles.overlay}>
          <TouchableOpacity style={StyleSheet.absoluteFill} onPress={() => !sending && setShowForm(false)} />
          <View style={styles.sheet}>
            <View style={styles.handle} />
            <Text style={styles.sheetTitle}>Rapport du jour</Text>
            <Text style={styles.sheetSub}>Mardi 28 avril · {user?.name ?? "Superviseur"}</Text>
            <ScrollView style={{ maxHeight: rs(500) }} showsVerticalScrollIndicator={false}>
              <View style={{ gap:rs(16), paddingBottom:rs(8) }}>
                {/* Profs présents */}
                <View>
                  <Text style={styles.qLabel}>Professeurs présents</Text>
                  <View style={styles.counter}>
                    <TouchableOpacity onPress={() => setProfsPresents(p => Math.max(0,p-1))} style={styles.counterBtn}><Text style={styles.counterBtnText}>−</Text></TouchableOpacity>
                    <Text style={styles.counterValue}>{profsPresents}</Text>
                    <TouchableOpacity onPress={() => setProfsPresents(p => Math.min(20,p+1))} style={styles.counterBtn}><Text style={styles.counterBtnText}>+</Text></TouchableOpacity>
                  </View>
                </View>
                {/* Classes terminées */}
                <View>
                  <Text style={styles.qLabel}>Classes ayant terminé leur planning</Text>
                  <View style={styles.counter}>
                    <TouchableOpacity onPress={() => setClassesTerminees(p => Math.max(0,p-1))} style={styles.counterBtn}><Text style={styles.counterBtnText}>−</Text></TouchableOpacity>
                    <Text style={styles.counterValue}>{classesTerminees}</Text>
                    <TouchableOpacity onPress={() => setClassesTerminees(p => Math.min(20,p+1))} style={styles.counterBtn}><Text style={styles.counterBtnText}>+</Text></TouchableOpacity>
                  </View>
                </View>
                {/* Incidents */}
                <View>
                  <Text style={styles.qLabel}>Incidents signalés ?</Text>
                  <View style={{ flexDirection:"row", gap:rs(10) }}>
                    {([{v:false,l:"Non ✓",c:C.success},{v:true,l:"Oui ⚠",c:C.danger}] as {v:boolean;l:string;c:string}[]).map(opt => {
                      const sel = incidents === opt.v;
                      return <TouchableOpacity key={String(opt.v)} onPress={() => setIncidents(opt.v)} style={[styles.toggle, sel && { borderColor:opt.c, backgroundColor:opt.c+"22" }]}>
                        <Text style={[styles.toggleText, sel && { color:opt.c }]}>{opt.l}</Text>
                      </TouchableOpacity>;
                    })}
                  </View>
                </View>
                {/* Bilan */}
                <View>
                  <Text style={styles.qLabel}>Bilan global</Text>
                  <View style={{ flexDirection:"row", gap:rs(8) }}>
                    {BILANS.map(b => {
                      const sel = bilan === b;
                      const col = bilanColor[b];
                      return <TouchableOpacity key={b} onPress={() => setBilan(b)} style={[styles.bilanBtn, sel && { borderColor:col, backgroundColor:col+"22" }]}>
                        <Text style={[styles.bilanText, sel && { color:col }]}>{b}</Text>
                      </TouchableOpacity>;
                    })}
                  </View>
                </View>
                {/* Commentaire */}
                <View>
                  <Text style={styles.qLabel}>Commentaire <Text style={{ color:C.textMuted, fontWeight:"400" }}>(optionnel)</Text></Text>
                  <TextInput value={commentaire} onChangeText={setCommentaire} multiline numberOfLines={3} placeholder="Observations, points positifs…" placeholderTextColor={C.textMuted}
                    style={styles.textarea} />
                </View>
              </View>
            </ScrollView>
            <TouchableOpacity onPress={handleSend} disabled={!canSend || sending}
              style={[styles.submitBtn, (!canSend || sending) && styles.submitBtnDisabled]}>
              {sending ? <ActivityIndicator size="small" color={C.textMuted} /> : <><Feather name="send" size={rs(16)} color="#fff" /><Text style={styles.submitText}>Envoyer</Text></>}
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Detail modal */}
      <Modal visible={!!detail} animationType="slide" transparent>
        <View style={styles.overlay}>
          <TouchableOpacity style={StyleSheet.absoluteFill} onPress={() => setDetail(null)} />
          <View style={styles.sheet}>
            <View style={styles.handle} />
            {detail && (
              <>
                <Text style={styles.sheetTitle}>Rapport · {detail.date}</Text>
                <Text style={styles.sheetSub}>{detail.status==="ok" ? `Envoyé à ${detail.heure}` : "Envoi échoué"}</Text>
                {detail.status === "ok" && (
                  <View style={{ gap:rs(8) }}>
                    {[["Profs présents", `${detail.profsPresents}`],["Classes terminées",`${detail.classesTerminees}`],["Incidents", detail.incidents?"Oui ⚠":"Non ✓"],["Bilan",detail.bilan??""]]
                      .map(([k,v]) => (
                        <View key={k} style={styles.detailRow}>
                          <Text style={styles.detailKey}>{k}</Text>
                          <Text style={styles.detailVal}>{v}</Text>
                        </View>
                      ))}
                    {detail.commentaire ? <View style={styles.detailRow}><Text style={styles.detailKey}>Commentaire</Text><Text style={styles.detailVal}>{detail.commentaire}</Text></View> : null}
                  </View>
                )}
                <TouchableOpacity onPress={() => setDetail(null)} style={styles.closeBtn}>
                  <Text style={styles.closeBtnText}>Fermer</Text>
                </TouchableOpacity>
              </>
            )}
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container:  { flex:1, backgroundColor:C.bg, paddingHorizontal:rs(14) },
  scroll:     { gap:rs(12), paddingBottom:rs(24) },
  sentBanner: { flexDirection:"row", alignItems:"center", gap:rs(8), backgroundColor:C.successSoft, borderWidth:1, borderColor:C.success, borderRadius:rs(12), padding:rs(12) },
  sentText:   { fontSize:rf(15), fontWeight:"700", color:C.success },
  statsRow:   { flexDirection:"row", gap:rs(10) },
  statCard:   { flex:1, borderRadius:rs(12), padding:rs(14), alignItems:"center" },
  statValue:  { fontSize:rf(22), fontWeight:"700" },
  statLabel:  { fontSize:rf(14), fontWeight:"600", marginTop:rs(2) },
  sendBtn:    { backgroundColor:C.brand, padding:rs(15), borderRadius:rs(14), flexDirection:"row", alignItems:"center", justifyContent:"center", gap:rs(9) },
  sendBtnText:{ color:"#fff", fontSize:rf(17), fontWeight:"700" },
  histCard:   { backgroundColor:C.surface, borderWidth:1, borderColor:C.border, borderRadius:rs(14), overflow:"hidden" },
  histTitle:  { fontSize:rf(15), fontWeight:"700", color:C.text, padding:rs(14), borderBottomWidth:1, borderBottomColor:C.border },
  histRow:    { flexDirection:"row", alignItems:"center", gap:rs(10), padding:rs(12), paddingHorizontal:rs(14) },
  histBorder: { borderBottomWidth:1, borderBottomColor:C.border },
  histFail:   { backgroundColor:"#FEF2F2" },
  histIcon:   { width:rs(28), height:rs(28), borderRadius:rs(14), backgroundColor:C.successSoft, alignItems:"center", justifyContent:"center" },
  histIconFail:{ backgroundColor:"#FEE2E2" },
  histDate:   { fontSize:rf(15), fontWeight:"700", color:C.text },
  histSub:    { fontSize:rf(13), color:C.textMuted, marginTop:rs(1) },
  histBtn:    { fontSize:rf(13), fontWeight:"700", color:C.textMuted },
  overlay:    { flex:1, backgroundColor:"rgba(0,0,0,0.45)", justifyContent:"flex-end" },
  sheet:      { backgroundColor:C.surface, borderTopLeftRadius:rs(24), borderTopRightRadius:rs(24), padding:rs(20), paddingBottom:rs(32), gap:rs(14) },
  handle:     { width:rs(40), height:rs(4), borderRadius:rs(2), backgroundColor:C.border, alignSelf:"center" },
  sheetTitle: { fontSize:rf(19), fontWeight:"700", color:C.text },
  sheetSub:   { fontSize:rf(14), color:C.textMuted, marginTop:-rs(8) },
  qLabel:     { fontSize:rf(15), fontWeight:"600", color:C.text, marginBottom:rs(8) },
  counter:    { flexDirection:"row", alignItems:"center", gap:rs(16) },
  counterBtn: { width:rs(38), height:rs(38), borderRadius:rs(19), backgroundColor:C.surfaceAlt, alignItems:"center", justifyContent:"center" },
  counterBtnText: { fontSize:rf(20), color:C.text, fontWeight:"600" },
  counterValue: { fontSize:rf(28), fontWeight:"700", color:C.text, minWidth:rs(40), textAlign:"center" },
  toggle:     { flex:1, padding:rs(11), borderRadius:rs(11), borderWidth:2, borderColor:C.border, alignItems:"center" },
  toggleText: { fontSize:rf(16), fontWeight:"700", color:C.textMuted },
  bilanBtn:   { flex:1, padding:rs(11), borderRadius:rs(11), borderWidth:2, borderColor:C.border, alignItems:"center" },
  bilanText:  { fontSize:rf(15), fontWeight:"700", color:C.textMuted },
  textarea:   { borderWidth:1.5, borderColor:C.border, borderRadius:rs(11), padding:rs(10), color:C.text, fontSize:rf(15), minHeight:rs(80), textAlignVertical:"top", backgroundColor:C.bg },
  submitBtn:  { backgroundColor:C.primary, padding:rs(14), borderRadius:rs(13), flexDirection:"row", alignItems:"center", justifyContent:"center", gap:rs(8) },
  submitBtnDisabled: { backgroundColor:C.surfaceAlt },
  submitText: { color:"#fff", fontSize:rf(17), fontWeight:"700" },
  detailRow:  { backgroundColor:C.surfaceAlt, borderRadius:rs(12), padding:rs(12), flexDirection:"row", justifyContent:"space-between" },
  detailKey:  { fontSize:rf(15), color:C.textMuted },
  detailVal:  { fontSize:rf(16), fontWeight:"700", color:C.text },
  closeBtn:   { backgroundColor:C.surfaceAlt, padding:rs(13), borderRadius:rs(12), alignItems:"center" },
  closeBtnText: { fontSize:rf(16), fontWeight:"600", color:C.text },
});
