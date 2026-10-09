import { useEffect, useState } from 'react'
import { api, apiRequest } from './api'
import { userSettingsText, type Language } from './i18n'

export type UserPreferences = {
  preferredLanguage: Language, sessionTimeoutMinutes: number, theme: 'system' | 'light' | 'dark' | 'ocean', compactMode: boolean,
  fontFamily: 'vazirmatn' | 'tahoma' | 'segoe' | 'arial' | 'naskh', fontSize: 'small' | 'normal' | 'large'
}

export default function UserSettingsPage({ language, onLanguageChanged, onPreferencesChanged, onPasswordChanged }: {
  language: Language,
  onLanguageChanged: (language: Language) => Promise<void>,
  onPreferencesChanged: (settings: UserPreferences) => Promise<UserPreferences>,
  onPasswordChanged: () => void
}) {
  const t = userSettingsText[language]
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
    api<UserPreferences>('/api/user-settings').then(value => setSettings({ ...value, preferredLanguage: language })).catch(e => setError(e instanceof Error ? e.message : String(e))).finally(() => setLoading(false))
  }, [])
  useEffect(() => { setSettings(value => ({ ...value, preferredLanguage: language })) }, [language])

  async function savePreferences() {
    if (saving) return
    setError(''); setMessage(''); setSaving(true)
    try {
      const saved = await onPreferencesChanged(settings)
      setSettings(saved)
      setMessage(t.saved)
    } catch (e) { setError(e instanceof Error ? e.message : String(e)) }
    finally { setSaving(false) }
  }

  async function changePassword() {
    setError(''); setMessage('')
    if (!currentPassword || !newPassword || !confirmPassword) { setError(t.completePasswords); return }
    if (newPassword !== confirmPassword) { setError(t.passwordMismatch); return }
    if (newPassword.length < 12) { setError(t.passwordLength); return }
    setSaving(true)
    try {
      await apiRequest('/api/user-settings/change-password', { method: 'POST', body: JSON.stringify({ currentPassword, newPassword, confirmPassword }) })
      onPasswordChanged()
    } catch (e) { setError(e instanceof Error ? e.message : String(e)) }
    finally { setSaving(false) }
  }

  if (loading) return <section className="panel settings-page"><p className="settings-loading">{t.loading}</p></section>
  return <section className="settings-page">
    <div className="settings-heading"><div><h1>{t.title}</h1><p>{t.subtitle}</p></div><span>⚙</span></div>
    {error && <div className="form-message error-message">{error}</div>}{message && <div className="form-message success-message">{message}</div>}
    <div className="settings-grid">
      <article className="panel settings-card">
        <div className="settings-card-head"><span>◷</span><div><h2>{t.workspace}</h2><p>{t.workspaceHint}</p></div></div>
        <div className="settings-fields">
          <label><span>{t.language}</span><select dir="ltr" value={settings.preferredLanguage} onChange={e => { const next = e.target.value as Language; setSettings(x => ({ ...x, preferredLanguage: next })); setMessage(''); void onLanguageChanged(next) }}><option value="fa">فارسی</option><option value="en">English</option><option value="zh">中文</option></select><small>{t.languageHint}</small></label>
          <label><span>{t.timeout}</span><input dir="ltr" type="number" min="1" max="480" value={settings.sessionTimeoutMinutes} onChange={e => setSettings(x => ({ ...x, sessionTimeoutMinutes: Number(e.target.value) }))} /><small>{t.timeoutHint}</small></label>
          <label><span>{t.theme}</span><select value={settings.theme} onChange={e => setSettings(x => ({ ...x, theme: e.target.value as UserPreferences['theme'] }))}><option value="system">{t.deviceTheme}</option><option value="light">{t.light}</option><option value="dark">{t.dark}</option><option value="ocean">{t.ocean}</option></select></label>
          <label><span>{t.fontFamily}</span><select value={settings.fontFamily} onChange={e => setSettings(x => ({ ...x, fontFamily: e.target.value as UserPreferences['fontFamily'] }))}><option value="vazirmatn">Vazirmatn / وزیرمتن</option><option value="tahoma">Tahoma / تاهوما</option><option value="segoe">Segoe UI</option><option value="arial">Arial</option><option value="naskh">Noto Naskh / B Nazanin</option></select><small>{t.fontFallback}</small></label>
          <label><span>{t.fontSize}</span><select value={settings.fontSize} onChange={e => setSettings(x => ({ ...x, fontSize: e.target.value as UserPreferences['fontSize'] }))}><option value="small">{t.smaller}</option><option value="normal">{t.normal}</option><option value="large">{t.larger}</option></select><small>{t.fontSizeHint}</small></label>
          <label className="settings-switch"><input type="checkbox" checked={settings.compactMode} onChange={e => setSettings(x => ({ ...x, compactMode: e.target.checked }))} /><span><b>{t.compact}</b><small>{t.compactHint}</small></span></label>
        </div>
        <button className="primary settings-save" disabled={saving} onClick={() => void savePreferences()}>F3&nbsp; {saving ? t.saving : t.saveApply}</button>
      </article>
      <article className="panel settings-card password-settings">
        <div className="settings-card-head"><span>⌁</span><div><h2>{t.passwordTitle}</h2><p>{t.passwordHint}</p></div></div>
        <div className="settings-fields">
          <PasswordField label={t.currentPassword} value={currentPassword} setValue={setCurrentPassword} show={showPasswords} />
          <PasswordField label={t.newPassword} value={newPassword} setValue={setNewPassword} show={showPasswords} />
          <PasswordField label={t.confirmPassword} value={confirmPassword} setValue={setConfirmPassword} show={showPasswords} />
          <label className="settings-switch"><input type="checkbox" checked={showPasswords} onChange={e => setShowPasswords(e.target.checked)} /><span><b>{t.showPasswords}</b><small>{t.showPasswordsHint}</small></span></label>
        </div>
        <button className="password-change" disabled={saving} onClick={() => void changePassword()}>{t.changePassword}</button>
      </article>
    </div>
    <div className="shortcut-bar settings-shortcuts"><button className="primary" disabled={saving} onClick={() => void savePreferences()}><kbd>F3</kbd><span>{t.saveSettings}</span></button><button onClick={() => window.dispatchEvent(new Event('close-active-form'))}><kbd>Esc</kbd><span>{t.exit}</span></button></div>
  </section>
}

function PasswordField({ label, value, setValue, show }: { label: string, value: string, setValue: (value: string) => void, show: boolean }) {
  return <label><span>{label}</span><input dir="ltr" autoComplete="new-password" type={show ? 'text' : 'password'} value={value} onChange={e => setValue(e.target.value)} /></label>
}
