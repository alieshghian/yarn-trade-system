export const latinDigits=(value:string)=>value.replace(/[۰-۹٠-٩]/g,digit=>String(digit.charCodeAt(0)&15)).replaceAll('٫','.')
