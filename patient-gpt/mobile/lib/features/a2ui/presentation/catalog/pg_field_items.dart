// TJ-ARCH-MOB-001 compliant
import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:genui/genui.dart';

import 'package:patient_gpt/core/theme/pg_text.dart';
import 'package:patient_gpt/core/theme/pg_theme.dart';
import 'package:patient_gpt/core/theme/tokens.dart';
import 'package:patient_gpt/core/widgets/pg_pressable.dart';
import 'package:patient_gpt/features/a2ui/presentation/catalog/pg_actions.dart';
import 'package:patient_gpt/features/a2ui/presentation/catalog/pg_fallback.dart';

/// The data-model path a control writes to: its bound path, or the
/// official default `<componentId>.<field>` when the value is a literal.
String _pathOf(CatalogItemContext ctx, Object? ref, String field) =>
    ref is Map && ref['path'] is String
    ? ref['path'] as String
    : '${ctx.id}.$field';

Widget _label(BuildContext context, String text) => Padding(
  padding: const EdgeInsets.only(bottom: 6),
  child: Text(
    text,
    style: PgText.body(
      size: PgSizes.meta,
      weight: 700,
      color: context.pg.fg2,
      height: 1.4,
    ),
  ),
);

/// A failed check, stated in words. Colour is not the signal.
Widget _problem(BuildContext context, String text) => Padding(
  padding: const EdgeInsets.only(top: 6),
  child: Text(
    text,
    style: PgText.body(
      size: PgSizes.meta,
      weight: 700,
      color: context.pg.fg,
      height: 1.4,
    ),
  ),
);

// ── TextField ───────────────────────────────────────────────────────────

/// TextField: the `.on-field` fill from tokens.css. --field, --field-fg,
/// --field-ph; focus swaps the fill to --field-focus. No outline.
CatalogItem pgTextField() => CatalogItem(
  name: BasicCatalogItems.textField.name,
  dataSchema: BasicCatalogItems.textField.dataSchema,
  isImplicitlyFlexible: true,
  widgetBuilder: (ctx) {
    final data = ctx.data as JsonMap;
    final onSubmit = data['onSubmittedAction'];
    if (onSubmit != null) {
      if (unsupportedAction(onSubmit) case final skipped?) {
        return PgA2uiFallback(name: 'TextField $skipped');
      }
    }
    final valueRef = data['value'];
    final path = _pathOf(ctx, valueRef, 'value');
    final variant = data['variant'] as String?;
    return BoundString(
      dataContext: ctx.dataContext,
      value: {'path': path},
      builder: (context, current) => BoundString(
        dataContext: ctx.dataContext,
        value: data['label'],
        builder: (context, label) => _PgTextField(
          initialValue: current ?? (valueRef is String ? valueRef : ''),
          label: label,
          variant: variant,
          checks: (data['checks'] as List?)?.cast<JsonMap>(),
          pattern: data['validationRegexp'] as String?,
          dataContext: ctx.dataContext,
          onChanged: (v) {
            final number = variant == 'number' ? num.tryParse(v) : null;
            ctx.dataContext.update(DataPath(path), number ?? v);
          },
          onSubmitted: onSubmit is JsonMap
              ? () => unawaited(runA2uiAction(ctx, onSubmit))
              : null,
        ),
      ),
    );
  },
);

final _numberPattern = RegExp(r'^-?\d*\.?\d*$');

class _PgTextField extends StatefulWidget {
  const _PgTextField({
    required this.initialValue,
    required this.label,
    required this.variant,
    required this.checks,
    required this.pattern,
    required this.dataContext,
    required this.onChanged,
    required this.onSubmitted,
  });

  final String initialValue;
  final String? label;
  final String? variant;
  final List<JsonMap>? checks;
  final String? pattern;
  final DataContext dataContext;
  final ValueChanged<String> onChanged;
  final VoidCallback? onSubmitted;

  @override
  State<_PgTextField> createState() => _PgTextFieldState();
}

class _PgTextFieldState extends State<_PgTextField> {
  late final TextEditingController _text = TextEditingController(
    text: widget.initialValue,
  );
  final FocusNode _focus = FocusNode();
  StreamSubscription<String?>? _checks;
  String? _checkError;

  @override
  void initState() {
    super.initState();
    _focus.addListener(() => setState(() {}));
    _watchChecks();
  }

  @override
  void didUpdateWidget(_PgTextField old) {
    super.didUpdateWidget(old);
    if (widget.initialValue != _text.text &&
        !(widget.variant == 'number' &&
            num.tryParse(widget.initialValue) == num.tryParse(_text.text))) {
      _text.text = widget.initialValue;
    }
    if (widget.checks != old.checks || widget.dataContext != old.dataContext) {
      _watchChecks();
    }
  }

  void _watchChecks() {
    unawaited(_checks?.cancel());
    _checks = null;
    if (widget.checks?.isEmpty ?? true) {
      _checkError = null;
      return;
    }
    _checks = ValidationHelper.validateStream(widget.checks, widget.dataContext)
        .listen((e) {
          if (mounted && e != _checkError) setState(() => _checkError = e);
        });
  }

  String? get _formatError {
    final p = widget.pattern;
    if (p == null || _text.text.isEmpty) return null;
    try {
      return RegExp('^(?:$p)\$').hasMatch(_text.text) ? null : 'Invalid format';
    } on FormatException {
      return null;
    }
  }

  @override
  void dispose() {
    unawaited(_checks?.cancel());
    _text.dispose();
    _focus.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final c = context.pg;
    final variant = widget.variant;
    final obscured = variant == 'obscured';
    final number = variant == 'number';
    final long = variant == 'longText';
    final error = _checkError ?? _formatError;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      mainAxisSize: MainAxisSize.min,
      children: [
        if (widget.label case final l? when l.isNotEmpty) _label(context, l),
        AnimatedContainer(
          duration: PgMotion.enter,
          curve: PgMotion.ease,
          constraints: const BoxConstraints(minHeight: 44),
          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
          decoration: BoxDecoration(
            color: _focus.hasFocus ? c.fieldFocus : c.field,
            borderRadius: BorderRadius.circular(PgRadius.r),
          ),
          child: Semantics(
            label: widget.label,
            textField: true,
            child: TextField(
              controller: _text,
              focusNode: _focus,
              obscureText: obscured,
              autocorrect: !obscured && !number,
              enableSuggestions: !obscured && !number,
              maxLines: long ? null : 1,
              minLines: long ? 3 : null,
              keyboardType: number
                  ? const TextInputType.numberWithOptions(
                      signed: true,
                      decimal: true,
                    )
                  : (long ? TextInputType.multiline : TextInputType.text),
              inputFormatters: number
                  ? [
                      TextInputFormatter.withFunction(
                        (o, n) => _numberPattern.hasMatch(n.text) ? n : o,
                      ),
                    ]
                  : null,
              cursorColor: c.fieldFg,
              style: PgText.body(color: c.fieldFg, height: 1.5),
              decoration: const InputDecoration(
                isCollapsed: true,
                border: InputBorder.none,
              ),
              onChanged: (v) {
                setState(() {});
                widget.onChanged(v);
              },
              onSubmitted: (_) {
                if (error == null) widget.onSubmitted?.call();
              },
            ),
          ),
        ),
        if (error != null) _problem(context, error),
      ],
    );
  }
}

// ── CheckBox ────────────────────────────────────────────────────────────

/// CheckBox: tokens.css `input[type="checkbox"]`. A 20 square in --field,
/// --primary-bg with a --primary-fg tick when checked; 44 high row.
CatalogItem pgCheckBox() => CatalogItem(
  name: BasicCatalogItems.checkBox.name,
  dataSchema: BasicCatalogItems.checkBox.dataSchema,
  isImplicitlyFlexible: true,
  widgetBuilder: (ctx) {
    final data = ctx.data as JsonMap;
    final path = _pathOf(ctx, data['value'], 'value');
    return BoundString(
      dataContext: ctx.dataContext,
      value: data['label'],
      builder: (context, label) => StreamBuilder<bool>(
        stream: ctx.dataContext.evaluateConditionStream(
          checksToExpression((data['checks'] as List?)?.cast<JsonMap>()),
        ),
        initialData: true,
        builder: (context, valid) => BoundBool(
          dataContext: ctx.dataContext,
          value: {'path': path},
          builder: (context, value) => Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            mainAxisSize: MainAxisSize.min,
            children: [
              PgChoiceRow(
                label: label ?? '',
                selected: value ?? false,
                round: false,
                onTap: () =>
                    ctx.dataContext.update(DataPath(path), !(value ?? false)),
              ),
              if (valid.data == false) _problem(context, 'Invalid value'),
            ],
          ),
        ),
      ),
    );
  },
);

/// One labelled check or radio row. Semantics carry the checked state.
class PgChoiceRow extends StatelessWidget {
  const PgChoiceRow({
    required this.label,
    required this.selected,
    required this.round,
    required this.onTap,
    super.key,
  });

  final String label;
  final bool selected;
  final bool round;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final c = context.pg;
    return Semantics(
      checked: selected,
      inMutuallyExclusiveGroup: round,
      label: label,
      excludeSemantics: true,
      child: PgPressable(
        onTap: onTap,
        hoverBackground: c.s2,
        radius: PgRadius.r,
        padding: const EdgeInsets.symmetric(horizontal: 8),
        builder: (context, fg) => Row(
          children: [
            _ChoiceBox(selected: selected, round: round),
            const SizedBox(width: 10),
            Expanded(
              child: Text(
                label,
                style: PgText.body(size: PgSizes.ui, color: fg, height: 1.4),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _ChoiceBox extends StatelessWidget {
  const _ChoiceBox({required this.selected, required this.round});

  final bool selected;
  final bool round;

  @override
  Widget build(BuildContext context) {
    final c = context.pg;
    return Container(
      width: 20,
      height: 20,
      alignment: Alignment.center,
      decoration: BoxDecoration(
        color: selected ? c.primaryBg : c.field,
        borderRadius: round ? null : BorderRadius.circular(4),
        shape: round ? BoxShape.circle : BoxShape.rectangle,
      ),
      child: !selected
          ? null
          : round
          ? Container(
              width: 8,
              height: 8,
              decoration: BoxDecoration(
                color: c.primaryFg,
                shape: BoxShape.circle,
              ),
            )
          : ClipPath(
              clipper: const _TickClipper(),
              child: SizedBox.square(
                dimension: 12,
                child: ColoredBox(color: c.primaryFg),
              ),
            ),
    );
  }
}

/// tokens.css: `clip-path: polygon(14% 44%, 0 65%, 50% 100%, 100% 16%,
/// 80% 0, 43% 62%)`.
class _TickClipper extends CustomClipper<Path> {
  const _TickClipper();

  @override
  Path getClip(Size s) => Path()
    ..moveTo(s.width * 0.14, s.height * 0.44)
    ..lineTo(0, s.height * 0.65)
    ..lineTo(s.width * 0.5, s.height)
    ..lineTo(s.width, s.height * 0.16)
    ..lineTo(s.width * 0.8, 0)
    ..lineTo(s.width * 0.43, s.height * 0.62)
    ..close();

  @override
  bool shouldReclip(_TickClipper oldClipper) => false;
}

// ── ChoicePicker ────────────────────────────────────────────────────────

/// ChoicePicker: check rows, radio rows (`mutuallyExclusive`) or chips
/// (`.chips`: --s2 pills, --fg fill with --bg text when selected).
CatalogItem pgChoicePicker() => CatalogItem(
  name: BasicCatalogItems.choicePicker.name,
  dataSchema: BasicCatalogItems.choicePicker.dataSchema,
  isImplicitlyFlexible: true,
  widgetBuilder: (ctx) {
    final data = ctx.data as JsonMap;
    final valueRef = data['value'];
    final path = _pathOf(ctx, valueRef, 'value');
    return StreamBuilder<bool>(
      stream: ctx.dataContext.evaluateConditionStream(
        checksToExpression((data['checks'] as List?)?.cast<JsonMap>()),
      ),
      initialData: true,
      builder: (context, valid) => BoundList(
        dataContext: ctx.dataContext,
        value: data['options'],
        builder: (context, options) => _PgChoicePicker(
          ctx: ctx,
          label: data['label'],
          options: options?.whereType<JsonMap>().toList() ?? const [],
          valueRef: valueRef,
          path: path,
          exclusive: data['variant'] == 'mutuallyExclusive',
          chips: data['displayStyle'] == 'chips',
          filterable: data['filterable'] == true,
          invalid: valid.data == false,
        ),
      ),
    );
  },
);

class _PgChoicePicker extends StatefulWidget {
  const _PgChoicePicker({
    required this.ctx,
    required this.label,
    required this.options,
    required this.valueRef,
    required this.path,
    required this.exclusive,
    required this.chips,
    required this.filterable,
    required this.invalid,
  });

  final CatalogItemContext ctx;
  final Object? label;
  final List<JsonMap> options;
  final Object? valueRef;
  final String path;
  final bool exclusive;
  final bool chips;
  final bool filterable;
  final bool invalid;

  @override
  State<_PgChoicePicker> createState() => _PgChoicePickerState();
}

class _PgChoicePickerState extends State<_PgChoicePicker> {
  String _filter = '';

  List<String> _selected(Object? current) => switch (current) {
    null => switch (widget.valueRef) {
      final List<Object?> l => [for (final v in l) '$v'],
      final String s => [s],
      _ => const [],
    },
    final List<Object?> l => [for (final v in l) '$v'],
    final v => ['$v'],
  };

  void _choose(String value, List<String> selected) {
    final next = widget.exclusive
        ? [value]
        : (selected.contains(value)
              ? (List.of(selected)..remove(value))
              : [...selected, value]);
    widget.ctx.dataContext.update(DataPath(widget.path), next);
  }

  @override
  Widget build(BuildContext context) {
    final ctx = widget.ctx;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      mainAxisSize: MainAxisSize.min,
      children: [
        if (widget.label != null)
          BoundString(
            dataContext: ctx.dataContext,
            value: widget.label,
            builder: (context, l) => l == null || l.isEmpty
                ? const SizedBox.shrink()
                : _label(context, l),
          ),
        if (widget.filterable)
          Padding(
            padding: const EdgeInsets.only(bottom: 8),
            child: _FilterField(onChanged: (v) => setState(() => _filter = v)),
          ),
        BoundObject(
          dataContext: ctx.dataContext,
          value: {'path': widget.path},
          builder: (context, current) {
            final selected = _selected(current);
            final rows = <Widget>[
              for (final option in widget.options)
                if (option['value'] case final String value)
                  BoundString(
                    dataContext: ctx.dataContext,
                    value: option['label'],
                    builder: (context, label) {
                      final text = label ?? value;
                      if (_filter.isNotEmpty &&
                          !text.toLowerCase().contains(_filter.toLowerCase())) {
                        return const SizedBox.shrink();
                      }
                      final on = selected.contains(value);
                      return widget.chips
                          ? _Chip(
                              label: text,
                              selected: on,
                              onTap: () => _choose(value, selected),
                            )
                          : PgChoiceRow(
                              label: text,
                              selected: on,
                              round: widget.exclusive,
                              onTap: () => _choose(value, selected),
                            );
                    },
                  ),
            ];
            return widget.chips
                ? Wrap(spacing: 8, runSpacing: 8, children: rows)
                : Column(
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: rows,
                  );
          },
        ),
        if (widget.invalid) _problem(context, 'Invalid selection'),
      ],
    );
  }
}

class _Chip extends StatelessWidget {
  const _Chip({
    required this.label,
    required this.selected,
    required this.onTap,
  });

  final String label;
  final bool selected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final c = context.pg;
    return Semantics(
      selected: selected,
      child: PgPressable(
        onTap: onTap,
        semanticLabel: label,
        // Selected chips take the prototype's one selected-state rule
        // (`.tab[aria-pressed="true"]`: --fg fill, --bg text, weight 700),
        // the same as web's `.a2-chips .chip[aria-pressed="true"]`.
        background: selected ? c.fg : c.s2,
        hoverBackground: selected ? c.fg : c.s3,
        foreground: selected ? c.bg : c.fg,
        radius: 22,
        padding: const EdgeInsets.symmetric(horizontal: 14),
        builder: (context, fg) => Center(
          widthFactor: 1,
          child: Text(
            label,
            style: PgText.body(
              size: PgSizes.ui,
              weight: selected ? 700 : 400,
              color: fg,
              height: 1.2,
            ),
          ),
        ),
      ),
    );
  }
}

class _FilterField extends StatefulWidget {
  const _FilterField({required this.onChanged});

  final ValueChanged<String> onChanged;

  @override
  State<_FilterField> createState() => _FilterFieldState();
}

class _FilterFieldState extends State<_FilterField> {
  final FocusNode _focus = FocusNode();

  @override
  void initState() {
    super.initState();
    _focus.addListener(() => setState(() {}));
  }

  @override
  void dispose() {
    _focus.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final c = context.pg;
    return Container(
      constraints: const BoxConstraints(minHeight: 44),
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
      decoration: BoxDecoration(
        color: _focus.hasFocus ? c.fieldFocus : c.field,
        borderRadius: BorderRadius.circular(PgRadius.r),
      ),
      child: TextField(
        focusNode: _focus,
        onChanged: widget.onChanged,
        cursorColor: c.fieldFg,
        style: PgText.body(size: PgSizes.ui, color: c.fieldFg, height: 1.5),
        decoration: InputDecoration(
          isCollapsed: true,
          border: InputBorder.none,
          hintText: 'Filter options',
          hintStyle: PgText.body(
            size: PgSizes.ui,
            color: c.fieldPh,
            height: 1.5,
          ),
        ),
      ),
    );
  }
}

// ── DateTimeInput ───────────────────────────────────────────────────────

/// DateTimeInput: a `--field` control that opens the platform date and time
/// pickers, flattened (no elevation, tint or rules). Writes the official
/// formats: `YYYY-MM-DD`, `HH:MM:00`, or ISO 8601 date-time.
CatalogItem pgDateTimeInput() => CatalogItem(
  name: BasicCatalogItems.dateTimeInput.name,
  dataSchema: BasicCatalogItems.dateTimeInput.dataSchema,
  isImplicitlyFlexible: true,
  widgetBuilder: (ctx) {
    final data = ctx.data as JsonMap;
    final valueRef = data['value'];
    final path = _pathOf(ctx, valueRef, 'value');
    // Official v0.9.1 flags only, read as web reads them
    // (web/src/features/a2ui/presentation/catalog/pg-fields.tsx): a missing
    // flag is false, and with neither set nothing renders.
    final withDate = data['enableDate'] == true;
    final withTime = data['enableTime'] == true;
    if (!withDate && !withTime) return const SizedBox.shrink();
    return BoundString(
      dataContext: ctx.dataContext,
      value: {'path': path},
      builder: (context, current) => BoundString(
        dataContext: ctx.dataContext,
        value: data['label'],
        builder: (context, label) => _PgDateTime(
          value: current ?? (valueRef is String ? valueRef : null),
          label: label,
          withDate: withDate,
          withTime: withTime,
          first:
              DateTime.tryParse(data['min'] as String? ?? '') ?? DateTime(1900),
          last:
              DateTime.tryParse(data['max'] as String? ?? '') ??
              DateTime(2100, 12, 31),
          onPicked: (v) => ctx.dataContext.update(DataPath(path), v),
        ),
      ),
    );
  },
);

class _PgDateTime extends StatelessWidget {
  const _PgDateTime({
    required this.value,
    required this.label,
    required this.withDate,
    required this.withTime,
    required this.first,
    required this.last,
    required this.onPicked,
  });

  final String? value;
  final String? label;
  final bool withDate;
  final bool withTime;
  final DateTime first;
  final DateTime last;
  final ValueChanged<String> onPicked;

  DateTime? get _parsed =>
      DateTime.tryParse(value ?? '') ??
      DateTime.tryParse('1970-01-01T${value ?? ''}');

  String _display(MaterialLocalizations l10n) {
    final d = _parsed;
    if (d == null) {
      return value ??
          (withDate && withTime
              ? 'Select a date and time'
              : withTime
              ? 'Select a time'
              : 'Select a date');
    }
    return [
      if (withDate) l10n.formatMediumDate(d),
      if (withTime) l10n.formatTimeOfDay(TimeOfDay.fromDateTime(d)),
    ].join(' ');
  }

  Widget _flat(BuildContext context, Widget? child) {
    final c = context.pg;
    final theme = Theme.of(context);
    return Theme(
      data: theme.copyWith(
        datePickerTheme: DatePickerThemeData(
          backgroundColor: c.bg,
          headerBackgroundColor: c.s1,
          headerForegroundColor: c.fg,
          elevation: 0,
          shadowColor: Colors.transparent,
          surfaceTintColor: Colors.transparent,
          dividerColor: Colors.transparent,
        ),
        timePickerTheme: TimePickerThemeData(
          backgroundColor: c.bg,
          elevation: 0,
        ),
      ),
      child: child ?? const SizedBox.shrink(),
    );
  }

  Future<void> _pick(BuildContext context) async {
    final initial = _parsed ?? DateTime.now();
    var date = initial;
    var time = TimeOfDay.fromDateTime(initial);
    if (withDate) {
      final picked = await showDatePicker(
        context: context,
        initialDate: initial.isBefore(first)
            ? first
            : (initial.isAfter(last) ? last : initial),
        firstDate: first,
        lastDate: last,
        builder: _flat,
      );
      if (picked == null) return;
      date = picked;
    }
    if (withTime) {
      if (!context.mounted) return;
      final picked = await showTimePicker(
        context: context,
        initialTime: time,
        builder: _flat,
      );
      if (picked == null) return;
      time = picked;
    }
    final at = DateTime(
      date.year,
      date.month,
      date.day,
      withTime ? time.hour : 0,
      withTime ? time.minute : 0,
    );
    String two(int v) => v.toString().padLeft(2, '0');
    onPicked(
      withDate && !withTime
          ? at.toIso8601String().split('T').first
          : !withDate && withTime
          ? '${two(at.hour)}:${two(at.minute)}:00'
          : at.toIso8601String(),
    );
  }

  @override
  Widget build(BuildContext context) {
    final c = context.pg;
    final text = _display(MaterialLocalizations.of(context));
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      mainAxisSize: MainAxisSize.min,
      children: [
        if (label case final l? when l.isNotEmpty) _label(context, l),
        PgPressable(
          onTap: () => unawaited(_pick(context)),
          semanticLabel: '${label ?? 'Date'}: $text',
          background: c.field,
          hoverBackground: c.fieldHover,
          foreground: c.fieldFg,
          focusBackground: c.fieldFocus,
          focusForeground: c.fieldFg,
          radius: PgRadius.r,
          padding: const EdgeInsets.symmetric(horizontal: 12),
          builder: (context, fg) => Align(
            alignment: AlignmentDirectional.centerStart,
            child: Text(text, style: PgText.body(color: fg, height: 1.5)),
          ),
        ),
      ],
    );
  }
}
