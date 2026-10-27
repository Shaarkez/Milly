import { useEffect, useMemo, useState, type FormEvent } from 'react'
import type { SupabaseClient } from '@supabase/supabase-js'
import { BadgeCheck, CalendarDays, LoaderCircle, Search, ShieldCheck, Users } from 'lucide-react'
import { readableError } from './lib/supabase'

type AdminProfile = {
  id: string
  display_name: string
  username: string
  user_number: number
  avatar_path: string | null
  is_verified: boolean
  created_at: string
  registration_date_override: string | null
  aliases: string[]
}

type AdminSpace = {
  id: string
  name: string
  owner_id: string
  actual_member_count: number
  display_member_count_override: number | null
}

type ProfileForm = {
  displayName: string
  username: string
  userNumber: string
  verified: boolean
  aliases: string
  displayDate: string
}

const dateInputValue = (value: string | null) => value ? new Date(value).toISOString().slice(0, 16) : ''
const formatDate = (value: string | null) => value
  ? new Intl.DateTimeFormat('ru', { day: 'numeric', month: 'long', year: 'numeric' }).format(new Date(value))
  : 'Не задана'

function formFrom(profile: AdminProfile): ProfileForm {
  return {
    displayName: profile.display_name,
    username: profile.username,
    userNumber: String(profile.user_number),
    verified: profile.is_verified,
    aliases: profile.aliases.join(', '),
    displayDate: dateInputValue(profile.registration_date_override),
  }
}

export default function AdminWorkspace({ client }: { client: SupabaseClient }) {
  const [section, setSection] = useState<'accounts' | 'channels'>('accounts')
  const [query, setQuery] = useState('')
  const [profiles, setProfiles] = useState<AdminProfile[]>([])
  const [spaces, setSpaces] = useState<AdminSpace[]>([])
  const [selectedId, setSelectedId] = useState('')
  const [form, setForm] = useState<ProfileForm | null>(null)
  const [countDrafts, setCountDrafts] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const selected = profiles.find((profile) => profile.id === selectedId)
  const normalizedQuery = useMemo(() => query.trim(), [query])

  useEffect(() => {
    let cancelled = false
    const timer = window.setTimeout(async () => {
      setLoading(true)
      setError('')
      try {
        const { data, error: failure } = await client.rpc('admin_search_profiles', { p_query: normalizedQuery })
        if (failure) throw failure
        if (cancelled) return
        const rows = (data ?? []) as AdminProfile[]
        setProfiles(rows)
        setSelectedId((current) => rows.some((row) => row.id === current) ? current : rows[0]?.id ?? '')
      } catch (caught) {
        if (!cancelled) setError(readableError(caught))
      } finally {
        if (!cancelled) setLoading(false)
      }
    }, 180)
    return () => { cancelled = true; window.clearTimeout(timer) }
  }, [client, normalizedQuery])

  useEffect(() => {
    if (!selected) {
      setForm(null)
      return
    }
    setForm(formFrom(selected))
  }, [selected?.id])

  useEffect(() => {
    let cancelled = false
    const loadSpaces = async () => {
      const { data, error: failure } = await client.rpc('admin_list_spaces')
      if (failure) {
        if (!cancelled) setError(readableError(failure))
        return
      }
      if (!cancelled) {
        const rows = (data ?? []) as AdminSpace[]
        setSpaces(rows)
        setCountDrafts((current) => Object.fromEntries(rows.map((space) => [
          space.id,
          current[space.id] ?? (space.display_member_count_override === null ? '' : String(space.display_member_count_override)),
        ])))
      }
    }
    void loadSpaces()
    return () => { cancelled = true }
  }, [client])

  async function saveProfile(event: FormEvent) {
    event.preventDefault()
    if (!selected || !form || saving) return
    const userNumber = Number(form.userNumber)
    if (!Number.isSafeInteger(userNumber) || userNumber < 1) {
      setError('ID должен быть положительным целым числом.')
      return
    }
    const aliases = form.aliases.split(/[\s,;]+/).map((value) => value.trim().replace(/^@/, '').toLowerCase()).filter(Boolean)
    setSaving(true); setError(''); setNotice('')
    try {
      const { error: failure } = await client.rpc('admin_update_profile', {
        p_profile_id: selected.id,
        p_display_name: form.displayName.trim(),
        p_username: form.username.trim().replace(/^@/, '').toLowerCase(),
        p_user_number: userNumber,
        p_is_verified: form.verified,
        p_registration_date_override: form.displayDate ? new Date(form.displayDate).toISOString() : null,
        p_aliases: aliases,
      })
      if (failure) throw failure
      setNotice('Профиль обновлён.')
      const { data, error: refreshError } = await client.rpc('admin_search_profiles', { p_query: normalizedQuery })
      if (refreshError) throw refreshError
      setProfiles((data ?? []) as AdminProfile[])
    } catch (caught) {
      setError(readableError(caught))
    } finally {
      setSaving(false)
    }
  }

  async function saveCount(space: AdminSpace) {
    const draft = countDrafts[space.id]?.trim() ?? ''
    const count = draft === '' ? null : Number(draft)
    if (count !== null && (!Number.isSafeInteger(count) || count < 0)) {
      setError('Введите целое число от 0 и выше или оставьте поле пустым.')
      return
    }
    setSaving(true); setError(''); setNotice('')
    try {
      const { error: failure } = await client.rpc('admin_set_space_display_count', {
        p_space_id: space.id,
        p_display_count: count,
      })
      if (failure) throw failure
      setSpaces((current) => current.map((row) => row.id === space.id ? { ...row, display_member_count_override: count } : row))
      setNotice('Отображаемое число сохранено. Реальные участники не изменены.')
    } catch (caught) {
      setError(readableError(caught))
    } finally {
      setSaving(false)
    }
  }

  return <section className="admin-workspace">
    <header className="admin-heading"><div><span className="form-kicker">УПРАВЛЕНИЕ MILLY</span><h1>Панель администратора</h1><p>Изменения профилей защищены серверными проверками прав.</p></div><div className="admin-shield"><ShieldCheck size={19} /><span>Администратор</span></div></header>
    <nav className="admin-tabs" aria-label="Разделы панели администратора">
      <button className={section === 'accounts' ? 'selected' : ''} onClick={() => setSection('accounts')}><Users size={16} /> Аккаунты</button>
      <button className={section === 'channels' ? 'selected' : ''} onClick={() => setSection('channels')}><BadgeCheck size={16} /> Каналы</button>
    </nav>
    {error && section === 'accounts' && !selected && <p className="admin-error" role="alert">{error}</p>}
    {section === 'accounts' ? <div className="admin-account-layout">
      <aside className="admin-account-list">
        <label className="admin-search"><Search size={16} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Имя, @username или #ID" /></label>
        <div className="admin-results">
          {loading && <div className="admin-state"><LoaderCircle className="spin" size={18} /> Ищем аккаунты…</div>}
          {!loading && !profiles.length && <div className="admin-state">Аккаунтов не найдено.</div>}
          {profiles.map((person) => <button key={person.id} className={`admin-profile-row${person.id === selectedId ? ' selected' : ''}`} onClick={() => setSelectedId(person.id)}>
            <span className="admin-avatar">{person.display_name.slice(0, 1).toUpperCase()}</span>
            <span><strong>{person.display_name}{person.is_verified && <BadgeCheck size={13} />}</strong><small>#{person.user_number} · @{person.username}</small></span>
          </button>)}
        </div>
      </aside>
      {selected && form ? <form className="admin-editor" onSubmit={(event) => void saveProfile(event)}>
        <div className="admin-editor-heading"><span className="admin-avatar admin-avatar-large">{selected.display_name.slice(0, 1).toUpperCase()}</span><div><h2>{selected.display_name}</h2><p>{selected.id}</p></div></div>
        <label>Отображаемое имя<input value={form.displayName} onChange={(event) => setForm({ ...form, displayName: event.target.value })} maxLength={40} required /></label>
        <div className="admin-field-grid">
          <label>Основной username<input value={form.username} onChange={(event) => setForm({ ...form, username: event.target.value })} minLength={3} maxLength={24} pattern="[a-zA-Z0-9_]+" required /></label>
          <label>Статический ID<input type="number" value={form.userNumber} onChange={(event) => setForm({ ...form, userNumber: event.target.value })} min={1} step={1} required /><span className="admin-input-hint">Если ID уже занят, он поменяется местами с текущим ID этого аккаунта.</span></label>
        </div>
        <label>Дополнительные username<span className="admin-input-hint">Разделяйте запятыми. Без символа @.</span><textarea value={form.aliases} onChange={(event) => setForm({ ...form, aliases: event.target.value })} maxLength={500} placeholder="например, millyteam, старый_ник" rows={2} /></label>
        <label className="admin-check-field"><input type="checkbox" checked={form.verified} onChange={(event) => setForm({ ...form, verified: event.target.checked })} /><span><strong>Подтверждённый аккаунт</strong><small>Показывать голубую отметку в профиле</small></span><BadgeCheck size={19} /></label>
        <div className="admin-date-card"><span><CalendarDays size={15} /> Системная дата регистрации</span><strong>{formatDate(selected.created_at)}</strong><small>Не редактируется — это исходная дата Supabase.</small></div>
        <label>Дата регистрации, отображаемая в Milly<span className="admin-input-hint">Пустое поле — показать системную дату.</span><input type="datetime-local" value={form.displayDate} onChange={(event) => setForm({ ...form, displayDate: event.target.value })} /></label>
        {error && <p className="admin-error" role="alert">{error}</p>}
        <button className="primary-button admin-save" disabled={saving}>{saving ? <LoaderCircle className="spin" size={16} /> : null} Сохранить изменения</button>
      </form> : <div className="admin-empty">Выберите аккаунт слева, чтобы открыть редактор.</div>}
    </div> : <section className="admin-channels"><div className="admin-section-intro"><h2>Отображение каналов</h2><p>Здесь можно изменить только цифру в интерфейсе. Фактический список участников останется прежним.</p></div>{spaces.length ? spaces.map((space) => <form key={space.id} className="admin-space-row" onSubmit={(event) => { event.preventDefault(); void saveCount(space) }}><div className="admin-space-icon"><HashIcon /></div><div className="admin-space-copy"><strong>{space.name}</strong><span>Фактических участников: {space.actual_member_count}</span></div><label><span>Показывать</span><input type="number" min={0} step={1} value={countDrafts[space.id] ?? ''} onChange={(event) => setCountDrafts((current) => ({ ...current, [space.id]: event.target.value }))} placeholder={String(space.actual_member_count)} /></label><button className="secondary-button" disabled={saving}>Сохранить</button></form>) : <div className="admin-state">Пространств пока нет.</div>}</section>}
    {error && section === 'channels' && <p className="admin-error" role="alert">{error}</p>}
    {notice && <p className="admin-notice" role="status">{notice}</p>}
  </section>
}

function HashIcon() {
  return <span aria-hidden="true">#</span>
}
