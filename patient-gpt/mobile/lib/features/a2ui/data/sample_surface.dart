// TJ-ARCH-MOB-001 compliant
import 'dart:convert';

import 'package:patient_gpt/features/a2ui/data/a2ui_wire.dart';
import 'package:patient_gpt/features/a2ui/domain/a2ui_intent.dart';

/// Debug-only sample: every component in the PatientGPT catalog, plus three
/// things it refuses (an excluded Image, an unregistered clinical component
/// and an `openUrl` action), so the fallbacks can be seen. Synthetic copy;
/// no patient data. The deterministic runtime emits no A2UI, so this is the
/// only surface the renderer draws today. Content and property names are
/// identical to web/src/features/a2ui/data/sample-surface.ts and follow the
/// official v0.9.1 schema (Tabs `title`/`child`, DateTimeInput `enableDate`).
final String a2uiSampleSource = [
  {
    'version': a2uiWireVersion,
    'createSurface': {
      'surfaceId': 'debug-sample',
      'catalogId': patientGptCatalogId,
    },
  },
  {
    'version': a2uiWireVersion,
    'updateComponents': {
      'surfaceId': 'debug-sample',
      'components': _components,
    },
  },
  {
    'version': a2uiWireVersion,
    'updateDataModel': {
      'surfaceId': 'debug-sample',
      'path': '/',
      'value': {
        'note': 'Flexion-extension films requested',
        'notify': true,
        'channel': ['portal'],
        'urgency': ['standard'],
        'visit': '2026-11-03',
        'weeks': 6,
      },
    },
  },
].map(jsonEncode).join('\n');

const List<Map<String, Object?>> _components = [
  {'id': 'root', 'component': 'Card', 'child': 'body'},
  {
    'id': 'body',
    'component': 'Column',
    'align': 'stretch',
    'children': [
      'title',
      'catalog',
      'intro',
      'iconRow',
      'tabs',
      'gap1',
      'note',
      'notify',
      'channel',
      'urgency',
      'visit',
      'weeks',
      'gap2',
      'actions',
      'modal',
      'refused',
      'image',
      'criteria',
      'openUrl',
      'listTitle',
      'list',
    ],
  },
  {
    'id': 'title',
    'component': 'Text',
    'variant': 'h3',
    'text': 'Sample surface',
  },
  {
    'id': 'catalog',
    'component': 'Text',
    'variant': 'caption',
    'text': 'urn:patientgpt:a2ui:catalog:basic:v1 · debug build only',
  },
  {
    'id': 'intro',
    'component': 'Text',
    'text':
        'Each control below is an official A2UI basic component drawn with '
        'PatientGPT tokens. Actions are reported to the app and not applied.',
  },
  {
    'id': 'iconRow',
    'component': 'Row',
    'align': 'center',
    'children': ['icon', 'iconLabel'],
  },
  {'id': 'icon', 'component': 'Icon', 'name': 'search'},
  {
    'id': 'iconLabel',
    'component': 'Text',
    'text': 'Icon from the prototype set',
  },
  {
    'id': 'tabs',
    'component': 'Tabs',
    'tabs': [
      {'title': 'Summary', 'child': 'tabA'},
      {'title': 'Sources', 'child': 'tabB'},
    ],
  },
  {
    'id': 'tabA',
    'component': 'Text',
    'text': 'Tab content uses the same prose style as the thread.',
  },
  {
    'id': 'tabB',
    'component': 'Text',
    'variant': 'caption',
    'text': 'Second tab',
  },
  {'id': 'gap1', 'component': 'Divider'},
  {
    'id': 'note',
    'component': 'TextField',
    'label': 'Request note',
    'value': {'path': '/note'},
  },
  {
    'id': 'notify',
    'component': 'CheckBox',
    'label': 'Notify the coordinator',
    'value': {'path': '/notify'},
  },
  {
    'id': 'channel',
    'component': 'ChoicePicker',
    'label': 'Channel',
    'displayStyle': 'chips',
    'options': [
      {'label': 'Portal', 'value': 'portal'},
      {'label': 'Fax', 'value': 'fax'},
      {'label': 'Phone', 'value': 'phone'},
    ],
    'value': {'path': '/channel'},
  },
  {
    'id': 'urgency',
    'component': 'ChoicePicker',
    'label': 'Urgency',
    'variant': 'mutuallyExclusive',
    'options': [
      {'label': 'Standard', 'value': 'standard'},
      {'label': 'Expedited', 'value': 'expedited'},
    ],
    'value': {'path': '/urgency'},
  },
  {
    'id': 'visit',
    'component': 'DateTimeInput',
    'label': 'Follow-up visit',
    'enableDate': true,
    'value': {'path': '/visit'},
  },
  {
    'id': 'weeks',
    'component': 'Slider',
    'label': 'Weeks of therapy',
    'min': 0,
    'max': 12,
    'value': {'path': '/weeks'},
  },
  {'id': 'gap2', 'component': 'Divider'},
  {
    'id': 'actions',
    'component': 'Row',
    'children': ['primary', 'ghost', 'borderless'],
  },
  {
    'id': 'primary',
    'component': 'Button',
    'variant': 'primary',
    'child': 'primaryLabel',
    'action': {
      'event': {
        'name': 'sample.request_records',
        'context': {
          'note': {'path': '/note'},
        },
      },
    },
  },
  {'id': 'primaryLabel', 'component': 'Text', 'text': 'Request records'},
  {
    'id': 'ghost',
    'component': 'Button',
    'child': 'ghostLabel',
    'action': {
      'event': {'name': 'sample.save_draft'},
    },
  },
  {'id': 'ghostLabel', 'component': 'Text', 'text': 'Save draft'},
  {
    'id': 'borderless',
    'component': 'Button',
    'variant': 'borderless',
    'child': 'borderlessLabel',
    'action': {
      'event': {'name': 'sample.dismiss'},
    },
  },
  {'id': 'borderlessLabel', 'component': 'Text', 'text': 'Dismiss'},
  {
    'id': 'modal',
    'component': 'Modal',
    'trigger': 'modalLabel',
    'content': 'modalBody',
  },
  {'id': 'modalLabel', 'component': 'Text', 'text': 'Open modal'},
  {
    'id': 'modalBody',
    'component': 'Column',
    'children': ['modalText', 'modalClose'],
  },
  {
    'id': 'modalText',
    'component': 'Text',
    'text': 'Modal content sits on the page background, over the scrim.',
  },
  {
    'id': 'modalClose',
    'component': 'Button',
    'child': 'modalCloseLabel',
    'action': {
      'functionCall': {'call': 'closeModal', 'args': <String, Object?>{}},
    },
  },
  {'id': 'modalCloseLabel', 'component': 'Text', 'text': 'Close'},
  {
    'id': 'refused',
    'component': 'Text',
    'variant': 'h5',
    'text': 'Refused by this catalog',
  },
  {'id': 'image', 'component': 'Image', 'url': 'https://example.invalid/x.png'},
  {'id': 'criteria', 'component': 'CriteriaList', 'items': <Object?>[]},
  {
    'id': 'openUrl',
    'component': 'Button',
    'child': 'openUrlLabel',
    'action': {
      'functionCall': {
        'call': 'openUrl',
        'args': {'url': 'https://example.invalid'},
      },
    },
  },
  {'id': 'openUrlLabel', 'component': 'Text', 'text': 'Open link'},
  {'id': 'listTitle', 'component': 'Text', 'variant': 'h5', 'text': 'List'},
  {
    'id': 'list',
    'component': 'List',
    'children': ['li1', 'li2'],
  },
  {'id': 'li1', 'component': 'Text', 'text': 'First item'},
  {'id': 'li2', 'component': 'Text', 'text': 'Second item'},
];
