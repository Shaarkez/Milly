import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import type { SupabaseClient, User } from '@supabase/supabase-js'
import { ArrowLeft, BadgeCheck, Hash, LoaderCircle, MessageSquare, Plus, Send, Users, X } from 'lucide-react'
import type { Profile } from './lib/types'
import { readableError } from './lib/supabase'

type Space = { id: string; name: string; description: string; owner_id: string; role: 'owner' | 'member'; display_member_count_override: number | null }
type SpaceChannel = { id: string; space_id: string; name: string; description: string; created_at: string }
type ChannelMessage = { id: string; channel_id: string; sender_id: string; body: string; created_at: string }
type Reaction = { id: number; channel_message_id: string; user_id: string; emoji: string }
type Props = {
  client: SupabaseClient
  user: User
  profile: Profile
  friends: Profile[]
  onBack: () => void
}

const reactionChoices = ['👍', '❤️', '😂', '🔥', '😮', '😢']
const formatTime = (value: string) => new Intl.DateTimeFormat('ru', { hour: '2-digit', minute: '2-digit' }).format(new Date(value))

function Avatar({ profile, size = 'normal' }: { profile?: Profile; size?: 'normal' | 'small' }) {
  const name = profile?.display_name ?? '?'
  return <span className={`avatar channel-avatar${size === 'small' ? ' channel-avatar-small' : ''}`} title={name}>
    {profile?.avatar_url ? <img src={profile.avatar_url} alt="" /> : name.slice(0, 1).toUpperCase()}
  </span>
}

export default function ChannelsWorkspace({ client, user, profile, friends, onBack }: Props) {
  const [spaces, setSpaces] = useState<Space[]>([])
  const [channels, setChannels] = useState<SpaceChannel[]>([])
  const [memberCounts, setMemberCounts] = useState<Record<string, number>>({})
  const [activeSpaceId, setActiveSpaceId] = useState('')
  const [activeChannelId, setActiveChannelId] = useState('')
  const [messages, setMessages] = useState<ChannelMessage[]>([])
  const [reactions, setReactions] = useState<Reaction[]>([])
  const [draft, setDraft] = useState('')
  const [spaceName, setSpaceName] = useState('')
  const [channelName, setChannelName] = useState('')
  const [invited, setInvited] = useState<string[]>([])
  const [showSpaceForm, setShowSpaceForm] = useState(false)
  const [showChannelForm, setShowChannelForm] = useState(false)
  const [loadingSpaces, setLoadingSpaces] = useState(true)
  const [loadingMessages, setLoadingMessages] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const scrollRef = useRef<HTMLDivElement>(null)

  const profileById = useMemo(() => new Map([profile, ...friends].map((person) => [person.id, person])), [profile, friends])
  const activeSpace = spaces.find((space) => space.id === activeSpaceId)
  const activeChannel = channels.find((channel) => channel.id === activeChannelId && channel.space_id === activeSpaceId)
  const spaceChannels = channels.filter((channel) => channel.space_id === activeSpaceId)

  const loadSpaces = useCallback(async () => {
    const { data: memberships, error: membershipError } = await client
      .from('private_space_members')
      .select('space_id,role')
      .eq('user_id', user.id)
    if (membershipError) throw membershipError
    const membershipRows = memberships ?? []
    if (!membershipRows.length) {
      setSpaces([])
      setChannels([])
      setMemberCounts({})
      setActiveSpaceId('')
      setActiveChannelId('')
      setLoadingSpaces(false)
      return
    }

    const ids = membershipRows.map((row) => row.space_id)
    const [{ data: spaceRows, error: spacesError }, { data: channelRows, error: channelsError }, { data: allMembers, error: membersError }] = await Promise.all([
      client.from('private_spaces').select('id,name,description,owner_id,display_member_count_override').in('id', ids).order('created_at'),
      client.from('private_space_channels').select('id,space_id,name,description,created_at').in('space_id', ids).order('created_at'),
      client.from('private_space_members').select('space_id,user_id').in('space_id', ids),
    ])
    if (spacesError || channelsError || membersError) throw spacesError || channelsError || membersError
    const roleBySpace = new Map(membershipRows.map((row) => [row.space_id, row.role as Space['role']]))
    const nextSpaces = (spaceRows ?? []).map((space) => ({ ...space, role: roleBySpace.get(space.id) ?? 'member' as const }))
    const nextChannels = (channelRows ?? []) as SpaceChannel[]
    const nextSpaceId = nextSpaces.some((space) => space.id === activeSpaceId) ? activeSpaceId : nextSpaces[0]?.id ?? ''
    setSpaces(nextSpaces)
    setChannels(nextChannels)
    setMemberCounts((allMembers ?? []).reduce((counts, member) => {
      counts[member.space_id] = (counts[member.space_id] ?? 0) + 1
      return counts
    }, {} as Record<string, number>))
    setActiveSpaceId(nextSpaceId)
    setActiveChannelId((current) => nextChannels.some((channel) => channel.id === current && channel.space_id === nextSpaceId)
      ? current
      : nextChannels.find((channel) => channel.space_id === nextSpaceId)?.id ?? '')
    setLoadingSpaces(false)
  }, [activeSpaceId, client, user.id])

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      try {
        await loadSpaces()
      } catch (caught) {
        if (!cancelled) setError(readableError(caught))
      } finally {
        if (!cancelled) setLoadingSpaces(false)
      }
    }
    void load()
    const timer = window.setInterval(() => { void load() }, 15000)
    return () => { cancelled = true; window.clearInterval(timer) }
  }, [loadSpaces])

  const refreshMessages = useCallback(async (channelId: string, cancelled: () => boolean, initial = false) => {
    const { data, error: failure } = await client
      .from('private_channel_messages')
      .select('id,channel_id,sender_id,body,created_at')
      .eq('channel_id', channelId)
      .order('created_at', { ascending: false })
      .limit(100)
    if (failure) throw failure
    if (cancelled()) return
    const rows = ((data ?? []) as ChannelMessage[]).reverse()
    setMessages((current) => {
      const merged = new Map(current.map((message) => [message.id, message]))
      for (const message of rows) merged.set(message.id, message)
      return [...merged.values()].sort((a, b) => a.created_at.localeCompare(b.created_at)).slice(-100)
    })
    if (rows.length) {
      const { data: reactionRows, error: reactionError } = await client
        .from('message_reactions')
        .select('id,channel_message_id,user_id,emoji')
        .in('channel_message_id', rows.map((message) => message.id))
      if (reactionError) throw reactionError
      if (!cancelled()) setReactions(reactionRows ?? [])
    } else if (initial && !cancelled()) {
      setReactions([])
    }
    if (initial && !cancelled()) requestAnimationFrame(() => scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight }))
  }, [client])

  useEffect(() => {
    if (!activeChannel) {
      setMessages([])
      setReactions([])
      return
    }
    let cancelled = false
    const isCancelled = () => cancelled
    let polling = false
    const refresh = async (initial = false) => {
      if (polling || cancelled) return
      polling = true
      try {
        await refreshMessages(activeChannel.id, isCancelled, initial)
      } catch (caught) {
        if (!cancelled) setError(readableError(caught))
      } finally {
        polling = false
        if (!cancelled) setLoadingMessages(false)
      }
    }
    setMessages([])
    setReactions([])
    setLoadingMessages(true)
    void refresh(true)
    const channel = client.channel(`private-channel:${activeChannel.id}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'private_channel_messages', filter: `channel_id=eq.${activeChannel.id}` }, () => {
        void refresh()
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'message_reactions' }, () => {
        void refresh()
      })
      .subscribe()
    const timer = window.setInterval(() => { void refresh() }, 3000)
    return () => {
      cancelled = true
      window.clearInterval(timer)
      void client.removeChannel(channel)
    }
  }, [activeChannel?.id, client, refreshMessages])

  async function createSpace(event: FormEvent) {
    event.preventDefault()
    if (busy) return
    setBusy(true); setError(''); setNotice('')
    try {
      const { data, error: failure } = await client.rpc('create_private_space', {
        space_name: spaceName.trim(),
        invited_user_ids: invited,
      })
      if (failure) throw failure
      const { data: firstChannel, error: firstChannelError } = await client
        .from('private_space_channels')
        .select('id')
        .eq('space_id', data)
        .order('created_at')
        .limit(1)
        .single()
      if (firstChannelError) throw firstChannelError
      await loadSpaces()
      setActiveSpaceId(data as string)
      setActiveChannelId(firstChannel.id)
      setSpaceName('')
      setInvited([])
      setShowSpaceForm(false)
      setNotice('Пространство создано. Друзья получили доступ к каналам.')
    } catch (caught) {
      setError(readableError(caught))
    } finally {
      setBusy(false)
    }
  }

  async function createChannel(event: FormEvent) {
    event.preventDefault()
    if (!activeSpace || busy) return
    setBusy(true); setError('')
    try {
      const { data, error: failure } = await client.rpc('create_private_space_channel', {
        p_space: activeSpace.id,
        channel_name: channelName.trim(),
      })
      if (failure) throw failure
      await loadSpaces()
      setActiveChannelId(data as string)
      setChannelName('')
      setShowChannelForm(false)
      setNotice('Канал создан.')
    } catch (caught) {
      setError(readableError(caught))
    } finally {
      setBusy(false)
    }
  }

  async function sendMessage(event: FormEvent) {
    event.preventDefault()
    const body = draft.trim()
    if (!activeChannel || !body || busy) return
    setBusy(true); setError('')
    try {
      const { data, error: failure } = await client
        .from('private_channel_messages')
        .insert({ channel_id: activeChannel.id, sender_id: user.id, body })
        .select('id,channel_id,sender_id,body,created_at')
        .single()
      if (failure) throw failure
      setMessages((current) => [...current.filter((message) => message.id !== data.id), data as ChannelMessage])
      setDraft('')
      requestAnimationFrame(() => scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' }))
    } catch (caught) {
      setError(readableError(caught))
    } finally {
      setBusy(false)
    }
  }

  async function toggleReaction(message: ChannelMessage, emoji: string) {
    const existing = reactions.find((reaction) => reaction.channel_message_id === message.id && reaction.user_id === user.id && reaction.emoji === emoji)
    setError('')
    const result = existing
      ? await client.from('message_reactions').delete().eq('id', existing.id)
      : await client.from('message_reactions').insert({ channel_message_id: message.id, user_id: user.id, emoji }).select('id,channel_message_id,user_id,emoji').single()
    if (result.error) {
      setError(readableError(result.error))
      return
    }
    if (existing) setReactions((current) => current.filter((reaction) => reaction.id !== existing.id))
    else if (result.data) setReactions((current) => [...current, result.data as Reaction])
  }

  const renderSpaceForm = showSpaceForm && <div className="channel-modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget && !busy) setShowSpaceForm(false) }}>
    <form className="channel-modal" onSubmit={(event) => void createSpace(event)}>
      <div className="channel-modal-heading"><div><span className="form-kicker">ЗАКРЫТОЕ ПРОСТРАНСТВО</span><h2>Создать пространство</h2></div><button type="button" className="icon-button" aria-label="Закрыть" onClick={() => setShowSpaceForm(false)}><X size={18} /></button></div>
      <label className="channel-field">Название<input value={spaceName} onChange={(event) => setSpaceName(event.target.value)} minLength={2} maxLength={48} placeholder="Например, Друзья" required autoFocus /></label>
      <div className="invite-friends"><strong>Пригласить друзей</strong><span>Только выбранные друзья смогут видеть это пространство.</span>{friends.length ? friends.map((friend) => <label className="invite-friend" key={friend.id}><input type="checkbox" checked={invited.includes(friend.id)} onChange={(event) => setInvited((current) => event.target.checked ? [...current, friend.id] : current.filter((id) => id !== friend.id))} /><Avatar profile={friend} size="small" /><span>{friend.display_name}<small>@{friend.username}</small></span></label>) : <p className="channel-empty-note">Сначала добавьте друзей в Milly.</p>}</div>
      {error && <p className="channel-form-error" role="alert">{error}</p>}
      <button className="primary-button channel-submit" disabled={busy || spaceName.trim().length < 2}>{busy ? <LoaderCircle className="spin" size={16} /> : <Plus size={16} />} Создать пространство</button>
    </form>
  </div>

  const renderChannelForm = showChannelForm && <div className="channel-modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget && !busy) setShowChannelForm(false) }}>
    <form className="channel-modal channel-modal-compact" onSubmit={(event) => void createChannel(event)}>
      <div className="channel-modal-heading"><div><span className="form-kicker">НОВАЯ ТЕМАТИКА</span><h2>Создать канал</h2></div><button type="button" className="icon-button" aria-label="Закрыть" onClick={() => setShowChannelForm(false)}><X size={18} /></button></div>
      <label className="channel-field">Название канала<input value={channelName} onChange={(event) => setChannelName(event.target.value)} minLength={2} maxLength={32} placeholder="например, игры" required autoFocus /></label>
      {error && <p className="channel-form-error" role="alert">{error}</p>}
      <button className="primary-button channel-submit" disabled={busy || channelName.trim().length < 2}>{busy ? <LoaderCircle className="spin" size={16} /> : <Plus size={16} />} Создать канал</button>
    </form>
  </div>

  return <div className="channels-workspace">
    <aside className="spaces-rail" aria-label="Пространства">
      <button className="channels-mobile-back" title="Назад к чатам" aria-label="Назад к чатам" onClick={onBack}><ArrowLeft size={17} /></button>
      {spaces.map((space) => <button key={space.id} className={`space-rail-button${space.id === activeSpaceId ? ' selected' : ''}`} title={space.name} aria-label={space.name} onClick={() => { setActiveSpaceId(space.id); setActiveChannelId(channels.find((channel) => channel.space_id === space.id)?.id ?? '') }}>{space.name.slice(0, 2).toUpperCase()}</button>)}
      <button className="space-rail-add" title="Создать пространство" aria-label="Создать пространство" onClick={() => { setError(''); setShowSpaceForm(true) }}><Plus size={20} /></button>
    </aside>
    <aside className="channel-list-panel">
      <header className="channel-space-heading"><div title={activeSpace?.description}><span>ВАШИ ПРОСТРАНСТВА</span><strong>{activeSpace?.name ?? 'Каналы'}</strong></div><button className="icon-button" title="Создать пространство" aria-label="Создать пространство" onClick={() => { setError(''); setShowSpaceForm(true) }}><Plus size={18} /></button></header>
      {loadingSpaces ? <div className="channel-loading"><LoaderCircle className="spin" size={18} /></div> : spaces.length === 0 ? <div className="channel-no-space"><div><Users size={21} /></div><strong>Создайте свой круг</strong><p>Закрытые пространства — место для общения с выбранными друзьями.</p><button className="primary-button" onClick={() => { setError(''); setShowSpaceForm(true) }}><Plus size={16} /> Создать пространство</button></div> : <>
        <div className="channel-list-heading"><span>ТЕКСТОВЫЕ КАНАЛЫ</span>{activeSpace?.role === 'owner' && <button className="icon-button" title="Создать канал" aria-label="Создать канал" onClick={() => { setError(''); setShowChannelForm(true) }}><Plus size={16} /></button>}</div>
        <nav className="space-channel-list" aria-label="Каналы">
          {spaceChannels.map((channel) => <button key={channel.id} className={`space-channel-button${channel.id === activeChannelId ? ' selected' : ''}`} onClick={() => setActiveChannelId(channel.id)}><Hash size={16} /><span>{channel.name}</span></button>)}
        </nav>
        <div className="channel-space-foot"><Avatar profile={profile} size="small" /><span><strong>{profile.display_name}</strong><small>#{profile.user_number}</small></span><span className="member-count" title={`${activeSpace?.display_member_count_override ?? memberCounts[activeSpaceId] ?? 0} участников`}><Users size={14} />{activeSpace?.display_member_count_override ?? memberCounts[activeSpaceId] ?? 0}</span></div>
      </>}
    </aside>
    <section className="channel-chat-pane">
      {activeChannel ? <>
        <header className="channel-chat-header"><div className="channel-title-icon"><Hash size={19} /></div><div><h2>{activeChannel.name}</h2><p>{activeChannel.description || activeSpace?.description || `${activeSpace?.name} · закрытый канал`}</p></div>        <span className="channel-member-pill"><Users size={15} />{activeSpace?.display_member_count_override ?? memberCounts[activeSpaceId] ?? 0}</span></header>
        <div className="channel-messages-scroll" ref={scrollRef}>
          {loadingMessages && <div className="channel-loading"><LoaderCircle className="spin" size={17} /> Загружаем сообщения</div>}
          {!messages.length && !loadingMessages ? <div className="channel-welcome"><div className="channel-welcome-icon"><Hash size={24} /></div><span>НАЧАЛО КАНАЛА</span><h2>Здесь начинается<br />общая история.</h2><p>Напишите первое сообщение в #{activeChannel.name}.</p></div> : messages.map((message) => {
            const author = profileById.get(message.sender_id)
            const grouped = reactions.filter((reaction) => reaction.channel_message_id === message.id)
            const groupedReactions = [...new Set(grouped.map((reaction) => reaction.emoji))].map((emoji) => ({
              emoji,
              count: grouped.filter((reaction) => reaction.emoji === emoji).length,
              active: grouped.some((reaction) => reaction.emoji === emoji && reaction.user_id === user.id),
            }))
            return <article className={`channel-message${message.sender_id === user.id ? ' own-message' : ''}`} key={message.id}>
              <Avatar profile={author} />
              <div className="channel-message-body"><header><strong>{author?.display_name ?? 'Участник'}{author?.is_verified && <BadgeCheck className="verified-mark" size={14} />}</strong><span>@{author?.username ?? 'member'}</span><time>{formatTime(message.created_at)}</time></header><p>{message.body}</p>
                <div className="channel-reaction-row">{groupedReactions.map((reaction) => <button key={reaction.emoji} className={`reaction-chip${reaction.active ? ' active' : ''}`} aria-label={`${reaction.emoji} ${reaction.count}`} onClick={() => void toggleReaction(message, reaction.emoji)}>{reaction.emoji}<span>{reaction.count}</span></button>)}<div className="reaction-picker">{reactionChoices.map((emoji) => <button key={emoji} title={`Поставить реакцию ${emoji}`} aria-label={`Поставить реакцию ${emoji}`} onClick={() => void toggleReaction(message, emoji)}>{emoji}</button>)}</div></div>
              </div>
            </article>
          })}
        </div>
        <form className="channel-composer" onSubmit={(event) => void sendMessage(event)}><div className="channel-composer-wrap"><textarea value={draft} onChange={(event) => setDraft(event.target.value)} placeholder={`Написать в #${activeChannel.name}`} rows={1} maxLength={4000} aria-label={`Сообщение в ${activeChannel.name}`} onKeyDown={(event) => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); event.currentTarget.form?.requestSubmit() } }} /><button className="channel-send-button" disabled={busy || !draft.trim()} aria-label="Отправить сообщение">{busy ? <LoaderCircle className="spin" size={17} /> : <Send size={17} />}</button></div><span>Enter — отправить · Shift + Enter — новая строка</span></form>
      </> : <div className="channel-welcome channel-select-prompt"><div className="channel-welcome-icon"><MessageSquare size={24} /></div><h2>Ваши каналы</h2><p>Создайте пространство для друзей или выберите канал слева.</p><button className="primary-button" onClick={() => { setError(''); setShowSpaceForm(true) }}><Plus size={16} /> Создать пространство</button></div>}
    </section>
    {renderSpaceForm}
    {renderChannelForm}
    {error && <div className="channel-toast channel-toast-error" role="alert">{error}<button onClick={() => setError('')} aria-label="Закрыть сообщение"><X size={15} /></button></div>}
    {notice && <div className="channel-toast" role="status">{notice}<button onClick={() => setNotice('')} aria-label="Закрыть сообщение"><X size={15} /></button></div>}
  </div>
}
