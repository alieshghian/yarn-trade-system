export type SyntheticPerson = { id: string, personCode: string, displayName: string, job: string, nationality: string, mobile: string, phone: string, address: string, notes: string, isActive: boolean }

const names = ['آرمان رضایی', 'سارا کریمی', 'شرکت نخ آریا', 'مهدی احمدی', 'لیلا محمدی', 'بازرگانی سپهر']
const jobs = ['مشتری', 'فروشنده', 'تأمین‌کننده', 'شریک']
export const createSyntheticPersons = (count: number): SyntheticPerson[] => Array.from({ length: count }, (_, index) => {
  const number = index + 1
  return { id: `synthetic-person-${number}`, personCode: `LAB-${String(number).padStart(6, '0')}`,
    displayName: names[index % names.length], job: jobs[index % jobs.length], nationality: index % 5 === 0 ? 'چینی' : 'ایرانی',
    mobile: `0912${String(1000000 + index).slice(-7)}`, phone: `021${String(1000000 + index).slice(-7)}`,
    address: `نشانی مصنوعی شماره ${number}`, notes: index % 3 === 0 ? 'نمونهٔ خطای نمایشی ندارد.' : 'رکورد مصنوعی آزمایشگاه', isActive: index % 9 !== 0 }
})

export const laboratoryDatasetSizes = [100, 1000, 10000] as const
