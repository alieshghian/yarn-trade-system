# FormValueList

Use `FormValueList` for title, address, phone and mobile lists. The Laboratory uses this same component for all four fields.

- `primary`: value selected for the current form.
- `numbers`: saved items (text or phone values).
- `listPrimary`: saved default item, independent of `primary`.
- `onSelectValue`: update only the current selection.
- `onChange(defaultValue, items, origins)`: validate and save the list and default together. Return `false` to keep the editor open on failure. The caller owns persistence and record identity.
- `multiline`: enable RTL text entries; otherwise entries use the phone editor and country code from `suggestedCode`.
- `canEdit` / `canRemove`: protect referenced items. `origins` retains original values through edits.

Closed controls use Up/Down to choose existing items. Enter advances when populated. Arriving at an empty display opens entry mode immediately, including when focus arrives from the preceding field through Enter. Clicking the value or chevron opens the list. In browsing mode Up/Down highlights whole rows and Enter selects the current form value without changing the saved default. Clicking a row also selects it. The complete display frame uses the normal field focus border; its internal input has no separate outline.

The external plus button or `+` on the display opens management. Existing rows can then be edited, removed or marked as default subject to protection callbacks. Every newly added row has a default selector, including during first entry; a selected blank or invalid default prevents saving. Only one default can be selected. F3 saves all changes together; Escape and outside clicks discard pending edits. Outside dismissal preserves the clicked focus.

The item body scrolls independently; Save, Cancel and Add remain visible. Text entries use RTL layout; phone values retain country codes, LTR layout and digit grouping. All variants share font sizes, colors, focus and action styling.

`designerMode` makes the complete display/add-button group inert and closes any popup without saving or advancing focus. The surrounding designer selects and transforms that group. The attached button has no independent position.

Designer overrides use the input part of the field: `componentAddWidth`, `componentAddHeight`, `componentAddBackground`, `componentAddTextColor`, `componentPopupBackground`, and `componentPopupFontSize`. These are validated, serialized and handled by the existing history/reset flow. Ordinary field font, color, size and appearance variables apply to the main display; popup variables remain separate.
