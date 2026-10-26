// TJ-ARCH-MOB-001 compliant
import 'dart:convert';

/// The A2UI version PatientGPT speaks on the wire, shared with web
/// (`@a2ui/web_core` 0.12.0 accepts only this string in direct messages).
const String a2uiWireVersion = 'v0.9.1';

/// GenUI 0.10.4's parser (`a2ui_core` 0.1.1) accepts only `v0.9`, the same
/// protocol line without the patch level.
const String _genuiVersion = 'v0.9';

/// Rewrites PatientGPT A2UI JSON lines for GenUI: each message must carry
/// exactly [a2uiWireVersion], which becomes GenUI's `v0.9`. Any other version
/// throws [FormatException] so a surface on an unknown protocol is refused,
/// never coerced.
String toGenuiLines(String source) {
  final lines = const LineSplitter()
      .convert(source)
      .where((line) => line.trim().isNotEmpty);
  return lines.map(_rewrite).join('\n');
}

String _rewrite(String line) {
  final decoded = jsonDecode(line);
  if (decoded is! Map<String, Object?>) {
    throw const FormatException('A2UI message is not a JSON object.');
  }
  final version = decoded['version'];
  if (version != a2uiWireVersion) {
    throw FormatException(
      'A2UI message version must be $a2uiWireVersion (got $version).',
    );
  }
  return jsonEncode({...decoded, 'version': _genuiVersion});
}
