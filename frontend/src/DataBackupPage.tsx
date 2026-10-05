import { useEffect, useMemo, useRef, useState } from 'react'
import { api, apiFile, apiRequest, ApiError } from './api'
import type { Language } from './i18n'

type BackupInfo = { database: string, attachmentCount: number, maxRestoreSize: number }
type RestoreResult = { message: string, fileName: string, createdAtUtc: string }
type OnlineUser = { id: string, displayName: string, email: string, lastSeenAtUtc: string }
type SavePicker = (options: { suggestedName: string, types: { description: string, accept: Record<string, string[]> }[] }) => Promise<{ createWritable(): Promise<{ write(value: Blob): Promise<void>, close(): Promise<void> }> }>

export default function DataBackupPage({ language, onRestored }: { language: Language, onRestored: (message: string) => void }) {
  const fa = language === 'fa'
  const [prefix, setPrefix] = useState('YT')
  const [info, setInfo] = useState<BackupInfo>()
  const [restoreFile, setRestoreFile] = useState<File>()
  const [confirmed, setConfirmed] = useState(false)
  const [busy, setBusy] = useState<'backup' | 'restore'>()
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [onlineUsers, setOnlineUsers] = useState<OnlineUser[]>([])
  const [operation, setOperation] = useState<'Backup' | 'Restore'>('Backup')
  const [reason, setReason] = useState(fa ? 'انجام عملیات نگهداری و تهیه نسخه ایمن از اطلاعات سیستم' : 'System maintenance and creation of a safe data archive')
  const [estimatedMinutes, setEstimatedMinutes] = useState(15)
  const [noticeSent, setNoticeSent] = useState(false)
  const restoreInput = useRef<HTMLInputElement>(null)
  const suggestedName = useMemo(() => `${prefix.toUpperCase()}-${persianDateStamp()}.zip`, [prefix])
  const validPrefix = /^[A-Za-z]{1,2}$/.test(prefix)
  const validRestoreName = restoreFile ? /^[A-Za-z]{1,2}-\d{8}\.zip$/i.test(restoreFile.name) : false

  async function refreshOnlineUsers() { try { setOnlineUsers(await api<OnlineUser[]>('/api/system-backup/online-users')) } catch { } }
  useEffect(() => {
    api<BackupInfo>('/api/system-backup/info').then(setInfo).catch(e => setError(e instanceof Error ? e.message : String(e)))
    void refreshOnlineUsers(); const timer = window.setInterval(() => void refreshOnlineUsers(), 10_000); return () => window.clearInterval(timer)
  }, [])

  function captureOnlineUsers(errorValue: unknown, requestedOperation: 'Backup' | 'Restore') {
    if (errorValue instanceof ApiError && Array.isArray(errorValue.details?.onlineUsers)) {
      setOnlineUsers(errorValue.details.onlineUsers as OnlineUser[]); setOperation(requestedOperation)
    }
  }

  async function sendExitMessage() {
    setError(''); setMessage('')
    try {
      await apiRequest('/api/system-backup/maintenance-notice', { method: 'POST', body: JSON.stringify({ operation, reason, estimatedMinutes }) })
      setNoticeSent(true)
      setMessage(fa ? 'پیام خروج برای کاربران آنلاین ارسال شد. پس از خروج آنها، فهرست به‌طور خودکار به‌روز می‌شود.' : 'The sign-out message was sent. The online list refreshes automatically.')
    } catch (e) { setError(e instanceof Error ? e.message : String(e)) }
  }

  async function cancelExitMessage() {
    try { await apiRequest('/api/system-backup/maintenance-notice/cancel', { method: 'POST' }); setNoticeSent(false); setMessage(fa ? 'پیام خروج لغو شد.' : 'The sign-out message was cancelled.') }
    catch (e) { setError(e instanceof Error ? e.message : String(e)) }
  }

  async function createBackup() {
    setError(''); setMessage('')
    if (!validPrefix) { setError(fa ? 'پیشوند باید یک یا دو حرف انگلیسی باشد.' : 'Prefix must be one or two English letters.'); return }
    let handle: Awaited<ReturnType<SavePicker>> | undefined
    try {
      const picker = (window as Window & { showSaveFilePicker?: SavePicker }).showSaveFilePicker
      if (picker) handle = await picker({ suggestedName, types: [{ description: 'ZIP archive', accept: { 'application/zip': ['.zip'] } }] })
      setBusy('backup')
      const result = await apiFile('/api/system-backup/export', { method: 'POST', body: JSON.stringify({ prefix }) })
      if (handle) { const writable = await handle.createWritable(); await writable.write(result.blob); await writable.close() }
      else { const url = URL.createObjectURL(result.blob); const link = document.createElement('a'); link.href = url; link.download = suggestedName; document.body.appendChild(link); link.click(); link.remove(); URL.revokeObjectURL(url) }
      setMessage(fa ? `نسخه پشتیبان «${suggestedName}» تهیه شد.` : `Backup “${suggestedName}” was created.`)
    } catch (e) {
      captureOnlineUsers(e, 'Backup')
      if ((e as DOMException)?.name !== 'AbortError') setError(e instanceof Error ? e.message : String(e))
    } finally { setBusy(undefined) }
  }

  async function restore() {
    setError(''); setMessage('')
    if (!restoreFile || !validRestoreName) { setError(fa ? 'یک فایل ZIP با نام معتبر انتخاب کنید.' : 'Select a ZIP file with a valid name.'); return }
    if (!confirmed) { setError(fa ? 'تأیید بازنویسی اطلاعات جاری الزامی است.' : 'You must confirm replacing current data.'); return }
    if (!window.confirm(fa ? 'تمام اطلاعات جاری با محتوای نسخه پشتیبان جایگزین می‌شود. ادامه می‌دهید؟' : 'All current data will be replaced by this backup. Continue?')) return
    const data = new FormData(); data.append('file', restoreFile); data.append('confirmation', 'RESTORE')
    setBusy('restore')
    try {
      const result = await apiRequest<RestoreResult>('/api/system-backup/restore', { method: 'POST', body: data })
      onRestored(result.message)
    } catch (e) { captureOnlineUsers(e, 'Restore'); setError(e instanceof Error ? e.message : String(e)) }
    finally { setBusy(undefined) }
  }

  return <section className="data-backup-page">
    <div className="settings-heading"><div><h1>{fa ? 'تهیه و بازخوانی اطلاعات' : 'Backup & Restore'}</h1><p>{fa ? 'تهیه نسخه کامل دیتابیس و پیوست‌ها یا بازگرداندن نسخه ذخیره‌شده' : 'Create or restore a complete database and attachments archive'}</p></div><span>⟳</span></div>
    {error && <div className="form-message error-message">{error}</div>}{message && <div className="form-message success-message">{message}</div>}
    {(onlineUsers.length > 0 || noticeSent) && <section className="panel online-users-panel"><div className="online-users-head"><div><h2>{onlineUsers.length ? (fa ? 'کاربران دیگری در سیستم حضور دارند' : 'Other users are online') : (fa ? 'پیام خروج فعال است' : 'Sign-out message is active')}</h2><p>{onlineUsers.length ? (fa ? 'تا خروج همه کاربران زیر، Backup و Restore غیرفعال است.' : 'Backup and restore remain disabled until all users below sign out.') : (fa ? 'همه کاربران خارج شده‌اند؛ می‌توانید عملیات را شروع یا پیام را لغو کنید.' : 'All other users are offline; start the operation or cancel the message.')}</p></div><div className="online-head-actions"><button onClick={() => void refreshOnlineUsers()}>{fa ? 'به‌روزرسانی' : 'Refresh'}</button>{noticeSent && <button className="cancel-notice" onClick={() => void cancelExitMessage()}>{fa ? 'لغو پیام' : 'Cancel message'}</button>}</div></div><div className="online-user-list">{onlineUsers.map(user => <article key={user.id}><span>{user.displayName.slice(0, 1)}</span><div><b>{user.displayName}</b><small>{user.email}</small></div><time>{new Date(user.lastSeenAtUtc).toLocaleTimeString(fa ? 'fa-IR' : 'en-GB', { hour: '2-digit', minute: '2-digit' })}</time></article>)}</div>{onlineUsers.length > 0 && <div className="maintenance-message-form"><label><span>{fa ? 'عملیات مورد نظر' : 'Planned operation'}</span><select value={operation} onChange={e => setOperation(e.target.value as 'Backup' | 'Restore')}><option value="Backup">{fa ? 'تهیه نسخه پشتیبان' : 'Backup'}</option><option value="Restore">{fa ? 'بازخوانی اطلاعات' : 'Restore'}</option></select></label><label className="message-reason"><span>{fa ? 'دلیل درخواست خروج' : 'Reason for sign-out'}</span><input value={reason} maxLength={500} onChange={e => setReason(e.target.value)} /></label><label><span>{fa ? 'مدت تقریبی (دقیقه)' : 'Estimated minutes'}</span><input dir="ltr" type="number" min="1" max="240" value={estimatedMinutes} onChange={e => setEstimatedMinutes(Number(e.target.value))} /></label><button className="primary" disabled={reason.trim().length < 5 || estimatedMinutes < 1 || estimatedMinutes > 240} onClick={() => void sendExitMessage()}>{fa ? 'ارسال پیام خروج' : 'Send sign-out message'}</button></div>}</section>}
    <div className="backup-summary"><span>{fa ? 'دیتابیس' : 'Database'}: <b>{info?.database ?? '—'}</b></span><span>{fa ? 'تعداد پیوست‌ها' : 'Attachments'}: <b>{info?.attachmentCount ?? '—'}</b></span><span>{fa ? 'فرمت خروجی' : 'Archive format'}: <b>ZIP</b></span></div>
    <div className="backup-grid">
      <article className="panel backup-card"><div className="backup-card-head"><span>⇩</span><div><h2>{fa ? 'تهیه نسخه پشتیبان' : 'Create backup'}</h2><p>{fa ? 'فایل شامل دیتابیس SQL Server، پیوست‌ها و مشخصات کنترلی است.' : 'Includes SQL Server database, attachments and validation manifest.'}</p></div></div>
        <div className="backup-fields"><label><span>{fa ? 'پیشوند نام فایل' : 'File prefix'}</span><input dir="ltr" maxLength={2} value={prefix} onChange={e => setPrefix(e.target.value.replace(/[^A-Za-z]/g, '').slice(0, 2))} /><small>{fa ? 'یک یا دو حرف انگلیسی' : 'One or two English letters'}</small></label><label><span>{fa ? 'نام پیشنهادی' : 'Suggested name'}</span><input dir="ltr" disabled value={validPrefix ? suggestedName : ''} /></label></div>
        <div className="backup-note">{fa ? 'در مرورگرهای پشتیبانی‌شده، پنجره انتخاب محل و نام فایل نمایش داده می‌شود.' : 'Supported browsers show a Save As dialog for location and file name.'}</div>
        <button className="primary backup-command" disabled={Boolean(busy) || !validPrefix || onlineUsers.length > 0} onClick={() => void createBackup()}>{busy === 'backup' ? (fa ? 'در حال تهیه نسخه…' : 'Creating backup…') : (fa ? 'انتخاب محل و تهیه نسخه پشتیبان' : 'Choose location & create backup')}</button>
      </article>
      <article className="panel backup-card restore-card"><div className="backup-card-head"><span>⇧</span><div><h2>{fa ? 'بازخوانی اطلاعات' : 'Restore data'}</h2><p>{fa ? 'فقط نسخه معتبر تهیه‌شده توسط همین سیستم پذیرفته می‌شود.' : 'Only a valid archive created by this system is accepted.'}</p></div></div>
        <input ref={restoreInput} hidden type="file" accept=".zip,application/zip" onChange={e => { setRestoreFile(e.target.files?.[0]); setConfirmed(false); setError('') }} />
        <button className="file-picker" onClick={() => restoreInput.current?.click()}><span>ZIP</span><b>{restoreFile?.name ?? (fa ? 'انتخاب فایل پشتیبان' : 'Select backup archive')}</b><small>{restoreFile ? `${(restoreFile.size / 1024 / 1024).toFixed(2)} MB` : (fa ? 'الگو: YT-14050519.zip' : 'Pattern: YT-14050519.zip')}</small></button>
        {restoreFile && !validRestoreName && <div className="form-message error-message">{fa ? 'نام فایل با الگوی مجاز مطابقت ندارد.' : 'The file name does not match the required pattern.'}</div>}
        <label className="restore-confirm"><input type="checkbox" checked={confirmed} onChange={e => setConfirmed(e.target.checked)} /><span>{fa ? 'می‌دانم که اطلاعات فعلی با نسخه انتخاب‌شده جایگزین می‌شود.' : 'I understand that current data will be replaced.'}</span></label>
        <button className="restore-command" disabled={Boolean(busy) || !validRestoreName || !confirmed || onlineUsers.length > 0} onClick={() => void restore()}>{busy === 'restore' ? (fa ? 'در حال کنترل و بازخوانی…' : 'Validating and restoring…') : (fa ? 'کنترل فایل و بازخوانی اطلاعات' : 'Validate & restore data')}</button>
      </article>
    </div>
    <div className="backup-warning"><b>{fa ? 'نکته مهم' : 'Important'}</b><span>{fa ? 'بازخوانی را زمانی انجام دهید که سایر کاربران از سیستم خارج شده‌اند. پس از موفقیت، نشست جاری بسته و ورود مجدد الزامی می‌شود.' : 'Restore only after other users sign out. A successful restore ends this session and requires sign-in.'}</span></div>
  </section>
}

function persianDateStamp() {
  const parts = new Intl.DateTimeFormat('en-US-u-ca-persian', { year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date())
  const value = (type: Intl.DateTimeFormatPartTypes) => parts.find(x => x.type === type)?.value ?? ''
  return `${value('year')}${value('month')}${value('day')}`
}
