import 'package:flutter/widgets.dart';

import '../model/evidence_state.dart';
import 'tokens.dart';

/// Maps each evidence state to its token pair.
///
/// Colour is REINFORCEMENT here, never the signal. Every surface that uses
/// these also renders the state's label, so the meaning survives greyscale and
/// colour-blindness — a requirement, not a nicety, when the three states route
/// work to different people.
({Color foreground, Color surface}) evidenceColors(
  AppTokens t,
  EvidenceState state,
) =>
    switch (state) {
      EvidenceState.met => (foreground: t.statusMet, surface: t.statusMetSurface),
      EvidenceState.gap => (foreground: t.statusGap, surface: t.statusGapSurface),
      EvidenceState.voidState => (
          foreground: t.statusVoid,
          surface: t.statusVoidSurface
        ),
    };
