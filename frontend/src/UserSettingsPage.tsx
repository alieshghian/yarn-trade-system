import { useEffect, useState } from 'react'
import { api, apiRequest } from './api'
import type { Language } from './i18n'

export type UserPreferences = {
  preferredLanguage: Language, sessionTimeoutMinutes: number, theme: 'system' | 'light' | 'dark' | 'ocean', compactMode: boolean,
  fontFamily: 'vazirmatn' | 'tahoma' | 'segoe' | 'arial' | 'naskh', fontSize: 'small' | 'normal' | 'large'
}

export default function UserSettingsPage({ language, onPreferencesChanged, onPasswordChanged }: {
  language: Language,
  onPreferencesChanged: (settings: UserPreferences) => void,
  onPasswordChanged: () => void
}) {
  const fa = language === 'fa'
  const [settings, setSettings] = useState<UserPreferences>({ preferredLanguage: language, sessionTimeoutMinutes: 30, theme: 'system', compactMode: false, fontFamily: 'vazirmatn', fontSize: 'normal' })
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPasswords, setShowPasswords] = useState(false)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    api<UserPreferences>('/api/user-settings').then(setSettings).catch(e => setError(e instanceof Error ? e.message : String(e))).finally(() => setLoading(false))
  }, [])

  async function savePreferences() {
    setError(''); setMessage(''); setSaving(true)
    try {
      const saved = await apiRequest<UserPreferences>('/api/user-settings', { method: 'PUT', body: JSON.stringify(settings) })
      setSettings(saved); onPreferencesChanged(saved)
      setMessage(fa ? 'تنظیمات شخصی شما ذخیره و اعمال شد.' : 'Your preferences were saved and applied.')
    } catch (e) { setError(e instanceof Error ? e.message : String(e)) }
    finally { setSaving(false) }
  }

  async function changePassword() {
    setError(''); setMessage('')
    if (!currentPassword || !newPassword || !confirmPassword) { setError(fa ? 'هر سه فیلد رمز عبور را تکمیل کنید.' : 'Complete all three password fields.'); return }
    if (newPassword !== confirmPassword) { setError(fa ? 'رمز جدید و تکرار آن یکسان نیست.' : 'New password and confirmation do not match.'); return }
    if (newPassword.length < 8) { setError(fa ? 'رمز جدید باید حداقل ۸ نویسه باشد.' : 'The new password must be at least 8 characters.'); return }
    setSaving(true)
    try {
      await apiRequest('/api/user-settings/change-password', { method: 'POST', body: JSON.stringify({ currentPassword, newPassword, confirmPassword }) })
      onPasswordChanged()
    } catch (e) { setError(e instanceof Error ? e.message : String(e)) }
    finally { setSaving(false) }
  }

  if (loading) return <section className="panel settings-page"><p className="settings-loading">{fa ? 'در حال دریافت تنظیمات…' : 'Loading settings…'}</p></section>
  return <section className="settings-page" onKeyDown={event => {
    if (event.key === 'F3') { event.preventDefault(); void savePreferences(); return }
    if (event.key !== 'Enter' || event.target instanceof HTMLButtonElement || event.target instanceof HTMLSelectElement) return
    event.preventDefault(); const fields = [...event.currentTarget.querySelectorAll<HTMLElement>('input:not(:disabled),select:not(:disabled),button:not(:disabled)')]; fields[fields.indexOf(event.target as HTMLElement) + 1]?.focus()
  }}>
    <div className="settings-heading"><div><h1>{fa ? 'تنظیمات کاربر' : 'User settings'}</h1><p>{fa ? 'تنظیمات این صفحه فقط برای حساب کاربری شما ذخیره می‌شود.' : 'These settings are stored only for your account.'}</p></div><span>⚙</span></div>
    {error && <div className="form-message error-message">{error}</div>}{message && <div className="form-message success-message">{message}</div>}
    <div className="settings-grid">
      <article className="panel settings-card">
        <div className="settings-card-head"><span>◷</span><div><h2>{fa ? 'نشست و محیط کار' : 'Session & workspace'}</h2><p>{fa ? 'زبان، زمان خروج خودکار و ظاهر سیستم' : 'Language, automatic sign-out and appearance'}</p></div></div>
        <div className="settings-fields">
          <label><span>{fa ? 'زبان سیستم' : 'System language'}</span><select value={settings.preferredLanguage} onChange={e => setSettings(x => ({ ...x, preferredLanguage: e.target.value as Language }))}><option value="fa">فارسی</option><option value="en">English</option></select><small>{fa ? 'پس از ثبت، جهت و تمام عناوین سیستم تغییر می‌کند.' : 'Saving changes direction and all system labels.'}</small></label>
          <label><span>{fa ? 'زمان نشست (دقیقه)' : 'Session timeout (minutes)'}</span><input dir="ltr" type="number" min="1" max="480" value={settings.sessionTimeoutMinutes} onChange={e => setSettings(x => ({ ...x, sessionTimeoutMinutes: Number(e.target.value) }))} /><small>{fa ? 'پس از این مدت بی‌کاری، سیستم برای حفاظت از اطلاعات خارج می‌شود.' : 'The system signs out after this period of inactivity.'}</small></label>
          <label><span>{fa ? 'تم رنگی' : 'Color theme'}</span><select value={settings.theme} onChange={e => setSettings(x => ({ ...x, theme: e.target.value as UserPreferences['theme'] }))}><option value="system">{fa ? 'مطابق تنظیمات دستگاه' : 'Use device setting'}</option><option value="light">{fa ? 'روشن' : 'Light'}</option><option value="dark">{fa ? 'تیره' : 'Dark'}</option><option value="ocean">{fa ? 'سبز اقیانوسی' : 'Ocean green'}</option></select></label>
          <label><span>{fa ? 'نوع فونت' : 'Font family'}</span><select value={settings.fontFamily} onChange={e => setSettings(x => ({ ...x, fontFamily: e.target.value as UserPreferences['fontFamily'] }))}><option value="vazirmatn">Vazirmatn / وزیرمتن</option><option value="tahoma">Tahoma / تاهوما</option><option value="segoe">Segoe UI</option><option value="arial">Arial</option><option value="naskh">Noto Naskh / B Nazanin</option></select><small>{fa ? 'در صورت نصب نبودن فونت، نزدیک‌ترین فونت جایگزین استفاده می‌شود.' : 'A compatible fallback is used if the font is not installed.'}</small></label>
          <label><span>{fa ? 'اندازه فونت' : 'Font size'}</span><select value={settings.fontSize} onChange={e => setSettings(x => ({ ...x, fontSize: e.target.value as UserPreferences['fontSize'] }))}><option value="small">{fa ? 'کوچک‌تر' : 'Smaller'}</option><option value="normal">{fa ? 'عادی' : 'Normal'}</option><option value="large">{fa ? 'بزرگ‌تر' : 'Larger'}</option></select><small>{fa ? 'ابعاد و حاشیه فیلدها و جدول‌ها تغییر نمی‌کند.' : 'Field and grid dimensions and margins remain unchanged.'}</small></label>
          <label className="settings-switch"><input type="checkbox" checked={settings.compactMode} onChange={e => setSettings(x => ({ ...x, compactMode: e.target.checked }))} /><span><b>{fa ? 'نمایش فشرده' : 'Compact display'}</b><small>{fa ? 'فاصله‌های فرم و جدول برای نمایش اطلاعات بیشتر کمتر می‌شود.' : 'Reduces form and grid spacing to show more information.'}</small></span></label>
        </div>
        <button className="primary settings-save" disabled={saving} onClick={() => void savePreferences()}>F3&nbsp; {saving ? (fa ? 'در حال ثبت…' : 'Saving…') : (fa ? 'ثبت و اعمال تنظیمات' : 'Save & apply')}</button>
      </article>
      <article className="panel settings-card password-settings">
        <div className="settings-card-head"><span>⌁</span><div><h2>{fa ? 'تغییر رمز عبور' : 'Change password'}</h2><p>{fa ? 'پس از تغییر رمز، ورود مجدد الزامی است.' : 'You must sign in again after changing it.'}</p></div></div>
        <div className="settings-fields">
          <PasswordField label={fa ? 'رمز عبور فعلی' : 'Current password'} value={currentPassword} setValue={setCurrentPassword} show={showPasswords} />
          <PasswordField label={fa ? 'رمز عبور جدید' : 'New password'} value={newPassword} setValue={setNewPassword} show={showPasswords} />
          <PasswordField label={fa ? 'تکرار رمز عبور جدید' : 'Confirm new password'} value={confirmPassword} setValue={setConfirmPassword} show={showPasswords} />
          <label className="settings-switch"><input type="checkbox" checked={showPasswords} onChange={e => setShowPasswords(e.target.checked)} /><span><b>{fa ? 'نمایش رمزها' : 'Show passwords'}</b><small>{fa ? 'برای اطمینان از صحت تایپ فعال کنید.' : 'Enable to verify what you typed.'}</small></span></label>
        </div>
        <button className="password-change" disabled={saving} onClick={() => void changePassword()}>{fa ? 'تغییر رمز و خروج از سیستم' : 'Change password & sign out'}</button>
      </article>
    </div>
    <div className="shortcut-bar settings-shortcuts"><button className="primary" onClick={() => void savePreferences()}><kbd>F3</kbd><span>{fa ? 'ثبت تنظیمات' : 'Save settings'}</span></button><button onClick={() => window.dispatchEvent(new Event('close-active-form'))}><kbd>Esc</kbd><span>{fa ? 'خروج' : 'Exit'}</span></button></div>
  </section>
}

function PasswordField({ label, value, setValue, show }: { label: string, value: string, setValue: (value: string) => void, show: boolean }) {
  return <label><span>{label}</span><input dir="ltr" autoComplete="new-password" type={show ? 'text' : 'password'} value={value} onChange={e => setValue(e.target.value)} /></label>
}
