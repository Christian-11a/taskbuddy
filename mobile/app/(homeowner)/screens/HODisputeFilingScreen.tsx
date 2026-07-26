import React, { useState } from 'react';
import { ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { ArrowLeft, CircleAlert, FileWarning } from 'lucide-react-native';
import ConfirmationModal from '../../../src/components/ConfirmationModal';
import { Colors, Radii, Shadows, Sizes, Spacing } from '../../../src/constants/theme';

interface HODisputeFilingScreenProps {
  onBack: () => void;
  onSubmitted: () => void;
}

const REASONS = ['Service not completed', 'Poor service quality', 'Incorrect charge', 'Other'];

export default function HODisputeFilingScreen({ onBack, onSubmitted }: HODisputeFilingScreenProps) {
  const [reason, setReason] = useState(REASONS[0]);
  const [details, setDetails] = useState('');
  const [detailsFocused, setDetailsFocused] = useState(false);
  const [showConfirmation, setShowConfirmation] = useState(false);

  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        <View style={styles.headerRow}>
          <TouchableOpacity style={styles.backButton} onPress={onBack} activeOpacity={0.8}>
            <ArrowLeft size={20} color={Colors.white} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>File a Dispute</Text>
          <View style={styles.headerSpacer} />
        </View>
        <Text style={styles.headerSubtitle}>Home Deep Clean · Juan dela Cruz</Text>
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.notice}>
          <CircleAlert size={20} color={Colors.error} />
          <Text style={styles.noticeText}>Provide accurate details. Our team will review your report and contact you with an update.</Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.label}>Reason for dispute</Text>
          <View style={styles.reasonList}>
            {REASONS.map((item) => {
              const selected = item === reason;
              return (
                <TouchableOpacity key={item} style={styles.reasonRow} onPress={() => setReason(item)} activeOpacity={0.8}>
                  <View style={[styles.radio, selected && styles.radioSelected]}>{selected && <View style={styles.radioDot} />}</View>
                  <Text style={styles.reasonText}>{item}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        <View style={styles.card}>
          <Text style={styles.label}>Describe the issue</Text>
          <TextInput
            style={[styles.detailsInput, detailsFocused && styles.detailsInputFocused]}
            value={details}
            onChangeText={setDetails}
            multiline
            textAlignVertical="top"
            placeholder="Tell us what happened and include any relevant details."
            placeholderTextColor={Colors.muted}
            onFocus={() => setDetailsFocused(true)}
            onBlur={() => setDetailsFocused(false)}
          />
        </View>

        <TouchableOpacity style={styles.submitButton} onPress={() => setShowConfirmation(true)} activeOpacity={0.85}>
          <FileWarning size={18} color={Colors.white} />
          <Text style={styles.submitText}>Submit Dispute Report</Text>
        </TouchableOpacity>
      </ScrollView>

      <ConfirmationModal
        visible={showConfirmation}
        title="Submit dispute report?"
        message="You are about to file this dispute for review. You can add more information when our support team contacts you."
        confirmLabel="Submit Report"
        onCancel={() => setShowConfirmation(false)}
        onConfirm={() => { setShowConfirmation(false); onSubmitted(); }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: Colors.background },
  header: { backgroundColor: Colors.brandDark, paddingTop: Sizes.statusBarHeight, paddingHorizontal: Spacing.screenH, paddingBottom: 22, borderBottomLeftRadius: 28, borderBottomRightRadius: 28 },
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingTop: 12, marginBottom: 12 },
  backButton: { width: 40, height: 40, borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.15)', alignItems: 'center', justifyContent: 'center' },
  headerTitle: { color: Colors.white, fontSize: 18, fontWeight: '800', fontFamily: 'Inter' },
  headerSpacer: { width: 40 },
  headerSubtitle: { color: 'rgba(255,255,255,0.72)', fontSize: 13, fontFamily: 'Inter' },
  content: { padding: Spacing.screenH, gap: 16 },
  notice: { flexDirection: 'row', gap: 10, backgroundColor: '#FEF2F2', borderRadius: 14, padding: 14, borderWidth: 1, borderColor: '#FECACA' },
  noticeText: { flex: 1, color: Colors.slate, fontFamily: 'Inter', fontSize: 13, lineHeight: 19 },
  card: { backgroundColor: Colors.white, borderRadius: Radii.card, padding: 18, ...Shadows.card },
  label: { color: Colors.brandDark, fontFamily: 'Inter', fontSize: 15, fontWeight: '800', marginBottom: 14 },
  reasonList: { gap: 13 },
  reasonRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  radio: { width: 20, height: 20, borderRadius: 10, borderWidth: 1.5, borderColor: Colors.muted, alignItems: 'center', justifyContent: 'center' },
  radioSelected: { borderColor: Colors.brandTeal },
  radioDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: Colors.brandTeal },
  reasonText: { color: Colors.slate, fontSize: 14, fontFamily: 'Inter' },
  detailsInput: { minHeight: 130, borderRadius: 12, backgroundColor: Colors.backgroundAlt, borderWidth: 1, borderColor: 'rgba(144,153,184,0.3)', padding: 14, color: Colors.brandDark, fontFamily: 'Inter', fontSize: 14 },
  detailsInputFocused: { borderColor: Colors.brandTeal, borderWidth: 2 },
  submitButton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: Colors.error, borderRadius: 24, paddingVertical: 15, marginTop: 4 },
  submitText: { color: Colors.white, fontSize: 15, fontWeight: '700', fontFamily: 'Inter' },
});
