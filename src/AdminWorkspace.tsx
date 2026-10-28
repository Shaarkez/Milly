import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { createPortal } from 'react-dom'
import type { SupabaseClient } from '@supabase/supabase-js'
import { ArrowLeft, BadgeCheck, CalendarDays, LoaderCircle, Search, ShieldCheck, Users } from 'lucide-react'
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
  description: string
  owner_id: string
  actual_member_count: number
  display_member_count_override: number | null
}

type AdminChannel = {
  id: string
  space_id: string
  space_name: string
  name: string
  description: string
}

type AdminGroup = {
  id: string
  name: string
  public_username: string | null
  is_verified: boolean
  created_by: string
  created_at: string
  member_count: number
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

export default function AdminWorkspace({ client, onExit }: { client: SupabaseClient; onExit: () => void }) {
  const [section, setSection] = useState<'accounts' | 'groups' | 'spaces'>('accounts')
  const [query, setQuery] = useState('')
  const [groupQuery, setGroupQuery] = useState('')
  const [profiles, setProfiles] = useState<AdminProfile[]>([])
  const [spaces, setSpaces] = useState<AdminSpace[]>([])
  const [channels, setChannels] = useState<AdminChannel[]>([])
  const [groups, setGroups] = useState<AdminGroup[]>([])
  const [selectedGroupId, setSelectedGroupId] = useState('')
  const [selectedId, setSelectedId] = useState('')
  const [form, setForm] = useState<ProfileForm | null>(null)
  const [countDrafts, setCountDrafts] = useState<Record<string, string>>({})
  const [spaceDrafts, setSpaceDrafts] = useState<Record<string, { name: string; description: string }>>({})
  const [channelDrafts, setChannelDrafts] = useState<Record<string, { name: string; description: string }>>({})
  const [loading, setLoading] = useState(true)
  const [spacesLoading, setSpacesLoading] = useState(true)
  const [groupsLoading, setGroupsLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [sidebarElement, setSidebarElement] = useState<HTMLElement | null>(null)
  const selected = profiles.find((profile) => profile.id === selectedId)
  const normalizedQuery = useMemo(() => query.trim(), [query])
  const normalizedGroupQuery = useMemo(() => groupQuery.trim().replace(/^[@#]/, '').toLowerCase(), [groupQuery])
  const visibleGroups = useMemo(() => groups.filter((group) => !normalizedGroupQuery
    || group.name.toLowerCase().includes(normalizedGroupQuery)
    || (group.public_username ?? '').toLowerCase().includes(normalizedGroupQuery)
    || group.id.toLowerCase().startsWith(normalizedGroupQuery)), [groups, normalizedGroupQuery])
  const selectedGroup = visibleGroups.find((group) => group.id === selectedGroupId)

  useEffect(() => {
    setSidebarElement(document.querySelector<HTMLElement>('.messenger-shell > .sidebar'))
  }, [])

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
      setSpacesLoading(true)
      try {
        const [{ data: spaceData, error: spaceError }, { data: channelData, error: channelError }] = await Promise.all([
          client.rpc('admin_list_spaces'),
          client.rpc('admin_list_channels'),
        ])
        if (spaceError || channelError) throw spaceError || channelError
        if (!cancelled) {
          const rows = (spaceData ?? []) as AdminSpace[]
          const channelRows = (channelData ?? []) as AdminChannel[]
          setSpaces(rows)
          setChannels(channelRows)
          setSpaceDrafts((current) => Object.fromEntries(rows.map((space) => [
            space.id,
            current[space.id] ?? { name: space.name, description: space.description },
          ])))
          setChannelDrafts((current) => Object.fromEntries(channelRows.map((channel) => [
            channel.id,
            current[channel.id] ?? { name: channel.name, description: channel.description },
          ])))
          setCountDrafts((current) => Object.fromEntries(rows.map((space) => [
            space.id,
            current[space.id] ?? (space.display_member_count_override === null ? '' : String(space.display_member_count_override)),
          ])))
        }
      } catch (caught) {
        if (!cancelled) setError(readableError(caught))
      } finally {
        if (!cancelled) setSpacesLoading(false)
      }
    }
    void loadSpaces()
    return () => { cancelled = true }
  }, [client])

  useEffect(() => {
    if (!visibleGroups.some((group) => group.id === selectedGroupId)) {
      setSelectedGroupId(visibleGroups[0]?.id ?? '')
    }
  }, [selectedGroupId, visibleGroups])

  async function saveSpace(space: AdminSpace) {
    const draft = spaceDrafts[space.id]
    if (!draft || saving) return
    setSaving(true); setError(''); setNotice('')
    try {
      const { error: failure } = await client.rpc('admin_update_space', {
        p_space_id: space.id,
        p_name: draft.name.trim(),
        p_description: draft.description.trim(),
      })
      if (failure) throw failure
      setSpaces((current) => current.map((row) => row.id === space.id
        ? { ...row, name: draft.name.trim(), description: draft.description.trim() }
        : row))
      setNotice(`Пространство «${draft.name.trim()}» обновлено.`)
    } catch (caught) {
      setError(readableError(caught))
    } finally {
      setSaving(false)
    }
  }

  async function saveChannel(channel: AdminChannel) {
    const draft = channelDrafts[channel.id]
    if (!draft || saving) return
    setSaving(true); setError(''); setNotice('')
    try {
      const { error: failure } = await client.rpc('admin_update_channel', {
        p_channel_id: channel.id,
        p_name: draft.name.trim(),
        p_description: draft.description.trim(),
      })
      if (failure) throw failure
      setChannels((current) => current.map((row) => row.id === channel.id
        ? { ...row, name: draft.name.trim(), description: draft.description.trim() }
        : row))
      setNotice(`Канал #${draft.name.trim()} обновлён.`)
    } catch (caught) {
      setError(readableError(caught))
    } finally {
      setSaving(false)
    }
  }

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

  async function setGroupVerification(group: AdminGroup, verified: boolean) {
    if (saving) return
    setSaving(true); setError(''); setNotice('')
    try {
      const { error: failure } = await client.rpc('admin_set_group_verified', {
        p_group_id: group.id,
        p_is_verified: verified,
      })
      if (failure) throw failure
      setGroups((current) => current.map((row) => row.id === group.id ? { ...row, is_verified: verified } : row))
      setNotice(`Галочка для группы «${group.name}» ${verified ? 'выдана' : 'снята'}.`)
    } catch (caught) {
      setError(readableError(caught))
    } finally {
      setSaving(false)
    }
  }

  useEffect(() => {
    let cancelled = false
    const loadGroups = async () => {
      setGroupsLoading(true)
      try {
        const { data, error: failure } = await client.rpc('admin_list_groups')
        if (failure) throw failure
        if (!cancelled) setGroups((data ?? []) as AdminGroup[])
      } catch (caught) {
        if (!cancelled) setError(readableError(caught))
      } finally {
        if (!cancelled) setGroupsLoading(false)
      }
    }
    void loadGroups()
    return () => { cancelled = true }
  }, [client])

  return <>
    {(section === 'accounts' || section === 'groups') && sidebarElement && createPortal(<aside className="admin-account-list">
      <div className="admin-sidebar-heading"><span className="form-kicker">УПРАВЛЕНИЕ MILLY</span><strong>{section === 'groups' ? 'Группы' : 'Аккаунты'}</strong></div>
      {section === 'accounts' ? <>
        <label className="admin-search"><Search size={16} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Имя, @username или #ID" /></label>
        <div className="admin-results">
          {loading && <div className="admin-state"><LoaderCircle className="spin" size={18} /> Ищем аккаунты…</div>}
          {!loading && !profiles.length && <div className="admin-state">Аккаунтов не найдено.</div>}
          {profiles.map((person) => <button key={person.id} className={`admin-profile-row${person.id === selectedId ? ' selected' : ''}`} onClick={() => setSelectedId(person.id)}>
            <span className="admin-avatar">{person.display_name.slice(0, 1).toUpperCase()}</span>
            <span><strong>{person.display_name}{person.is_verified && <BadgeCheck size={13} />}</strong><small>#{person.user_number} · @{person.username}</small></span>
          </button>)}
        </div>
      </> : <>
        <label className="admin-search"><Search size={16} /><input value={groupQuery} onChange={(event) => setGroupQuery(event.target.value)} placeholder="Название, @username или ID" /></label>
        <div className="admin-results">
          {groupsLoading && <div className="admin-state"><LoaderCircle className="spin" size={18} /> Ищем группы…</div>}
          {!groupsLoading && !visibleGroups.length && <div className="admin-state">Групп не найдено.</div>}
          {visibleGroups.map((group) => <button key={group.id} className={`admin-profile-row${group.id === selectedGroupId ? ' selected' : ''}`} onClick={() => setSelectedGroupId(group.id)}>
            <span className="admin-avatar">{group.name.slice(0, 1).toUpperCase()}</span>
            <span><strong>{group.name}{group.is_verified && <BadgeCheck size={13} />}</strong><small>{group.public_username ? `@${group.public_username}` : `${group.member_count} участников`}</small></span>
          </button>)}
        </div>
      </>}
    </aside>, sidebarElement)}
  <section className="admin-workspace">
    <header className="admin-heading"><div><span className="form-kicker">УПРАВЛЕНИЕ MILLY</span><h1>Панель администратора</h1><p>Изменения профилей защищены серверными проверками прав.</p></div><div className="admin-heading-actions"><div className="admin-shield"><ShieldCheck size={19} /><span>Администратор</span></div><button type="button" className="secondary-button admin-exit" onClick={onExit}><ArrowLeft size={15} /> Выйти из панели</button></div></header>
    <nav className="admin-tabs" aria-label="Разделы панели администратора">
      <button className={section === 'accounts' ? 'selected' : ''} type="button" onClick={() => setSection('accounts')}><Users size={16} /> Аккаунты</button>
      <button className={section === 'groups' ? 'selected' : ''} type="button" onClick={() => setSection('groups')}><Users size={16} /> Группы</button>
      <button className={section === 'spaces' ? 'selected' : ''} type="button" onClick={() => setSection('spaces')}><ShieldCheck size={16} /> Пространства</button>
    </nav>
    {error && !selected && <p className="admin-error" role="alert">{error}</p>}
    {section === 'accounts' ? <div className="admin-account-layout">
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
    </div> : section === 'groups' ? <section className="admin-channels admin-groups">
      <div className="admin-section-intro"><h2>Групповые чаты</h2><p>Выдавайте и снимайте подтверждение группы. Доступ к управлению проверяется в Supabase.</p></div>
      {groupsLoading ? <div className="admin-state"><LoaderCircle className="spin" size={18} /> Загружаем группы…</div> : selectedGroup ? <article className="admin-space-card admin-group-card">
        <div className="admin-space-card-heading"><div className="admin-space-icon"><Users size={17} /></div><div className="admin-space-copy"><strong>{selectedGroup.name}{selectedGroup.is_verified && <BadgeCheck size={14} />}</strong><span>{selectedGroup.public_username ? `@${selectedGroup.public_username} · ` : ''}{selectedGroup.member_count} участников · создана {formatDate(selectedGroup.created_at)}</span></div></div>
        <label className="admin-check-field"><input type="checkbox" checked={selectedGroup.is_verified} disabled={saving} onChange={(event) => void setGroupVerification(selectedGroup, event.target.checked)} /><span><strong>Подтверждённая группа</strong><small>Показывать синюю отметку рядом с названием</small></span><BadgeCheck size={19} /></label>
      </article> : <div className="admin-state">{groups.length ? 'По запросу ничего не найдено.' : 'Групп пока нет.'}</div>}
      {error && <p className="admin-error" role="alert">{error}</p>}
      {notice && <p className="admin-notice" role="status">{notice}</p>}
    </section> : <section className="admin-channels">
      <div className="admin-section-intro"><h2>Пространства и текстовые каналы</h2><p>Названия и описания редактируются в базе. Фактический состав участников не меняется.</p></div>
      {spacesLoading ? <div className="admin-state"><LoaderCircle className="spin" size={18} /> Загружаем пространства и каналы…</div> : spaces.length ? spaces.map((space) => <article key={space.id} className="admin-space-card">
        <div className="admin-space-card-heading"><div className="admin-space-icon"><HashIcon /></div><div className="admin-space-copy"><strong>{space.name}</strong><span>Фактических участников: {space.actual_member_count}</span></div></div>
        <form className="admin-resource-form" onSubmit={(event) => { event.preventDefault(); void saveSpace(space) }}>
          <label>Название пространства<input value={spaceDrafts[space.id]?.name ?? space.name} onChange={(event) => setSpaceDrafts((current) => ({ ...current, [space.id]: { name: event.target.value, description: current[space.id]?.description ?? space.description } }))} minLength={2} maxLength={48} required /></label>
          <label>Описание пространства<textarea value={spaceDrafts[space.id]?.description ?? space.description} onChange={(event) => setSpaceDrafts((current) => ({ ...current, [space.id]: { name: current[space.id]?.name ?? space.name, description: event.target.value } }))} maxLength={300} rows={2} placeholder="Описание не задано" /></label>
          <button className="secondary-button" disabled={saving}>Сохранить пространство</button>
        </form>
        <form className="admin-count-form" onSubmit={(event) => { event.preventDefault(); void saveCount(space) }}>
          <div><strong>Количество участников</strong><small>В базе: {space.actual_member_count}. Override — только отображение.</small></div>
          <label><span>Показывать</span><input type="number" min={0} step={1} value={countDrafts[space.id] ?? ''} onChange={(event) => setCountDrafts((current) => ({ ...current, [space.id]: event.target.value }))} placeholder={String(space.actual_member_count)} /></label>
          <button className="secondary-button" disabled={saving}>Сохранить число</button>
        </form>
        <div className="admin-channel-list"><h3>Текстовые каналы</h3>
          {channels.filter((channel) => channel.space_id === space.id).length
            ? channels.filter((channel) => channel.space_id === space.id).map((channel) => <form key={channel.id} className="admin-channel-form" onSubmit={(event) => { event.preventDefault(); void saveChannel(channel) }}>
              <span className="admin-channel-hash">#</span>
              <label>Название<input value={channelDrafts[channel.id]?.name ?? channel.name} onChange={(event) => setChannelDrafts((current) => ({ ...current, [channel.id]: { name: event.target.value, description: current[channel.id]?.description ?? channel.description } }))} minLength={2} maxLength={32} required /></label>
              <label>Описание<input value={channelDrafts[channel.id]?.description ?? channel.description} onChange={(event) => setChannelDrafts((current) => ({ ...current, [channel.id]: { name: current[channel.id]?.name ?? channel.name, description: event.target.value } }))} maxLength={300} placeholder="Описание не задано" /></label>
              <button className="secondary-button" disabled={saving}>Сохранить</button>
            </form>)
            : <p className="admin-channel-empty">Каналов пока нет.</p>}
        </div>
      </article>) : <div className="admin-state">Пространств пока нет.</div>}
    </section>}
    {error && section === 'spaces' && <p className="admin-error" role="alert">{error}</p>}
    {notice && <p className="admin-notice" role="status">{notice}</p>}
  </section></>
}

function HashIcon() {
  return <span aria-hidden="true">#</span>
}
