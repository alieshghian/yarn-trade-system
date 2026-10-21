/** Shared command names and destinations for fields, headers and future targets.
 * Adapters may change storage, never replace the color/font tools with a form. */
export const appearanceColors=[
 {property:'backgroundColor',label:'تغییر رنگ پس‌زمینه'},
 {property:'textColor',label:'تغییر رنگ متن'},
 {property:'borderColor',label:'تغییر رنگ کادر'}
] as const
export const appearanceBoxCommands=[
 {property:'width',section:'size',label:'تغییر اندازه'},
 {property:'borderWidth',section:'borders',label:'ضخامت کادر'},
 {property:'borderRadius',section:'borders',label:'گردی گوشه‌ها'}
] as const
