import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from 'react'
import type { Session } from '@supabase/supabase-js'
import { ArrowLeft, Check, CheckCheck, CircleHelp, Copy, ImagePlus, LoaderCircle, LogOut, MessageCircle, MoreHorizontal, Phone, Plus, Search, Send, Settings2, ShieldCheck, Users, Wifi, WifiOff, X } from 'lucide-react'
import { isSupabaseConfigured, pageSize, readableError, supabase } from './lib/supabase'
import type { CallSignal, Conversation, FriendRequest, Message, Profile } from './lib/types'
import { isAllowedImage, registrationSchema, signInSchema, usernameSchema } from './lib/validation'

type Dialog = 'friends' | 'profile' | null
type CallPhase = 'idle' | 'calling' | 'incoming' | 'connecting' | 'connected'
type PendingOffer = { callId: string; from: string; offer: RTCSessionDescriptionInit }
const colors = ['#6d8371', '#8b6a5f', '#687c91', '#927b4e', '#806d88']
const initials = (name: string) => name.trim().split(/\s+/).slice(0, 2).map((part) => part[0]).join('').toUpperCase() || '?'
const clock = (value: string) => new Intl.DateTimeFormat('ru', { hour: '2-digit', minute: '2-digit' }).format(new Date(value))
const displayDate = (value: string) => new Date(value).toDateString() === new Date().toDateString() ? clock(value) : new Intl.DateTimeFormat('ru', { day: 'numeric', month: 'short' }).format(new Date(value))

function Avatar({ name, online = false, large = false, image }: { name: string; online?: boolean; large?: boolean; image?: string }) {
  return <span className={`avatar${large ? ' avatar-large' : ''}`} style={{ backgroundColor: colors[(name.charCodeAt(0) || 0) % colors.length] }}>{image ? <img src={image} alt="" /> : initials(name)}{online && <i className="presence-dot" />}</span>
}

function AuthScreen() {
  const [register, setRegister] = useState(false)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  async function submit(event: FormEvent) {
    event.preventDefault()
    if (!supabase) return
    setBusy(true); setError(''); setNotice('')
    try {
      const credentials = register
        ? registrationSchema.parse({ email: email.trim(), password, displayName: name })
        : signInSchema.parse({ email: email.trim(), password })
      if (register) {
        const { data, error: failure } = await supabase.auth.signUp({ email: credentials.email, password: credentials.password, options: { data: { display_name: 'displayName' in credentials ? credentials.displayName : '' }, emailRedirectTo: `${window.location.origin}/?email_confirmed=1` } })
        if (failure) throw failure
        if (!data.session) setNotice('Проверьте почту и подтвердите адрес, чтобы войти.')
      } else {
        const { error: failure } = await supabase.auth.signInWithPassword({ email: credentials.email, password: credentials.password })
        if (failure) throw failure
      }
    } catch (caught) { setError(readableError(caught)) }
    finally { setBusy(false) }
  }
  return <main className="auth-page"><div className="auth-aside"><div className="brand brand-auth"><span className="brand-mark"><MessageCircle size={17} strokeWidth={2.4} /></span><span>milly</span></div><div className="auth-note"><span className="eyebrow">ВАШ КРУГ, ВАШ РИТМ</span><h1>Разговоры,<br />которые рядом.</h1><p>Тихое место для своих. Без лишнего шума.</p></div><div className="auth-foot"><ShieldCheck size={15} /> Личные сообщения видны только участникам</div></div>
    <form className="auth-form" onSubmit={submit}><div className="auth-form-inner"><span className="form-kicker">{register ? 'СОЗДАТЬ АККАУНТ' : 'С ВОЗВРАЩЕНИЕМ'}</span><h2>{register ? 'Ваше место уже ждёт.' : 'Хорошо, что вы здесь.'}</h2><p className="form-description">{register ? 'Придумайте имя и приходите к своим.' : 'Войдите, чтобы продолжить разговор.'}</p>
      {register && <label>Как к вам обращаться<input autoComplete="name" value={name} onChange={(event) => setName(event.target.value)} placeholder="Ваше имя" required maxLength={40} /></label>}
      <label>Электронная почта<input type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@example.com" required /></label><label>Пароль<input type="password" autoComplete={register ? 'new-password' : 'current-password'} value={password} onChange={(event) => setPassword(event.target.value)} placeholder={register ? 'Не меньше 8 символов' : 'Ваш пароль'} minLength={8} required /></label>
      {error && <p className="form-alert" role="alert">{error}</p>}{notice && <p className="form-notice">{notice}</p>}<button className="primary-button auth-submit" disabled={busy} type="submit">{busy && <LoaderCircle className="spin" size={17} />}{register ? 'Создать аккаунт' : 'Войти'}<span>↗</span></button><p className="auth-switch">{register ? 'Уже есть аккаунт?' : 'Впервые в Milly?'} <button type="button" onClick={() => { setRegister(!register); setError(''); setNotice('') }}>{register ? 'Войти' : 'Создать аккаунт'}</button></p>
    </div><span className="auth-version">MILLY · ЛИЧНОЕ ПРОСТРАНСТВО</span></form></main>
}

export default function Messenger() {
  const [session, setSession] = useState<Session | null>(null)
  const [authLoading, setAuthLoading] = useState(true)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [friends, setFriends] = useState<Profile[]>([])
  const [requests, setRequests] = useState<FriendRequest[]>([])
  const [active, setActive] = useState<Conversation | null>(null)
  const [messages, setMessages] = useState<Message[]>([])
  const [hasOlder, setHasOlder] = useState(false)
  const [loadingMessages, setLoadingMessages] = useState(false)
  const [text, setText] = useState('')
  const [search, setSearch] = useState('')
  const [section, setSection] = useState<'chats' | 'friends'>('chats')
  const [dialog, setDialog] = useState<Dialog>(null)
  const [friendId, setFriendId] = useState('')
  const [friendMatches, setFriendMatches] = useState<Profile[]>([])
  const [friendSearching, setFriendSearching] = useState(false)
  const [friendToRemove, setFriendToRemove] = useState<Profile | null>(null)
  const [friendBusy, setFriendBusy] = useState(false)
  const [notice, setNotice] = useState('')
  const [error, setError] = useState('')
  const [online, setOnline] = useState<Set<string>>(new Set())
  const [connected, setConnected] = useState(navigator.onLine)
  const [sending, setSending] = useState(false)
  const [callPhase, setCallPhase] = useState<CallPhase>('idle')
  const [callDuration, setCallDuration] = useState(0)
  const [muted, setMuted] = useState(false)
  const [incomingFrom, setIncomingFrom] = useState('')
  const [ownAvatar, setOwnAvatar] = useState('')
  const [installPrompt, setInstallPrompt] = useState<Event & { prompt?: () => Promise<void> } | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const composerRef = useRef<HTMLTextAreaElement>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const avatarRef = useRef<HTMLInputElement>(null)
  const audioRef = useRef<HTMLAudioElement>(null)
  const peerConnection = useRef<RTCPeerConnection | null>(null)
  const localStream = useRef<MediaStream | null>(null)
  const callRef = useRef<{ id: string; peer: string } | null>(null)
  const callBusy = useRef(false)
  const pendingOffer = useRef<PendingOffer | null>(null)
  const pendingCandidates = useRef<RTCIceCandidateInit[]>([])
  const callTimeout = useRef<number | undefined>(undefined)
  const friendsRef = useRef<Profile[]>([])
  const client = supabase
  const user = session?.user

  useEffect(() => {
    if (!client) { setAuthLoading(false); return }
    const emailConfirmedRedirect = new URLSearchParams(window.location.search).get('email_confirmed') === '1'
    client.auth.getSession().then(({ data, error: failure }) => {
      if (failure) setError(readableError(failure))
      setSession(data.session)
      if (emailConfirmedRedirect) setNotice('Электронная почта подтверждена. Добро пожаловать в Milly!')
      setAuthLoading(false)
    })
    const { data: listener } = client.auth.onAuthStateChange((event, nextSession) => {
      setSession(nextSession)
      if (event === 'SIGNED_IN') setOwnAvatar('')
      if (event === 'SIGNED_IN' && emailConfirmedRedirect) setNotice('Электронная почта подтверждена. Добро пожаловать в Milly!')
      if (!nextSession) { setProfile(null); setOwnAvatar(''); setFriends([]); setRequests([]); setConversations([]); setActive(null) }
    })
    return () => listener.subscription.unsubscribe()
  }, [client])

  useEffect(() => {
    const update = () => setConnected(navigator.onLine)
    const capture = (event: Event) => { event.preventDefault(); setInstallPrompt(event as Event & { prompt?: () => Promise<void> }) }
    window.addEventListener('online', update); window.addEventListener('offline', update); window.addEventListener('beforeinstallprompt', capture)
    return () => { window.removeEventListener('online', update); window.removeEventListener('offline', update); window.removeEventListener('beforeinstallprompt', capture) }
  }, [])

  useEffect(() => {
    if (!client || !user) return
    let cancelled = false
    setOwnAvatar('')
    const loadAccount = async () => {
      const [{ data: own, error: ownError }, { data: links, error: linksError }, { data: requestRows, error: requestError }] = await Promise.all([
        client.from('profiles').select('id,milly_id,user_number,username,display_name,avatar_path').eq('id', user.id).single(),
        client.from('friendships').select('user_low,user_high').or(`user_low.eq.${user.id},user_high.eq.${user.id}`),
        client.from('friend_requests').select('id,sender_id,receiver_id,created_at').eq('receiver_id', user.id).eq('status', 'pending'),
      ])
      if (cancelled) return
      if (ownError || linksError || requestError) { setError(readableError(ownError || linksError || requestError)); return }
      setProfile(own as Profile)
      if (own?.avatar_path) {
        const { data, error: avatarError } = await client.storage.from('milly-avatars').createSignedUrl(own.avatar_path, 3600)
        if (cancelled) return
        if (avatarError) setError(readableError(avatarError))
        setOwnAvatar(data?.signedUrl ?? '')
      } else {
        setOwnAvatar('')
      }
      const friendIds = (links ?? []).map((row: { user_low: string; user_high: string }) => row.user_low === user.id ? row.user_high : row.user_low)
      const requestIds = (requestRows ?? []).map((row: FriendRequest) => row.sender_id)
      const allIds = [...new Set([...friendIds, ...requestIds])]
      const [{ data: people, error: peopleError }, { data: convoRows, error: convoError }] = await Promise.all([
        allIds.length ? client.from('profiles').select('id,milly_id,user_number,username,display_name,avatar_path').in('id', allIds) : Promise.resolve({ data: [], error: null }),
        friendIds.length ? client.from('conversations').select('id,user_low,user_high,updated_at').or(`user_low.eq.${user.id},user_high.eq.${user.id}`) : Promise.resolve({ data: [], error: null }),
      ])
      if (cancelled) return
      if (peopleError || convoError) { setError(readableError(peopleError || convoError)); return }
      const profiles = await Promise.all((people ?? []).map(async (person: Profile) => {
        if (!person.avatar_path) return person
        const { data: signed } = await client.storage.from('milly-avatars').createSignedUrl(person.avatar_path, 3600)
        return { ...person, avatar_url: signed?.signedUrl }
      }))
      if (cancelled) return
      const byId = new Map(profiles.map((person: Profile) => [person.id, person]))
      const friendList = friendIds.map((id: string) => byId.get(id)).filter(Boolean) as Profile[]
      setFriends(friendList); friendsRef.current = friendList
      setRequests((requestRows ?? []).map((row: FriendRequest) => ({ ...row, sender: byId.get(row.sender_id) })))
      const chats = (convoRows ?? []).map((row: Omit<Conversation, 'peer'>) => ({ ...row, peer: byId.get(row.user_low === user.id ? row.user_high : row.user_low)! })).filter((row: Conversation) => row.peer)
      if (chats.length) {
        const { data: recent } = await client.from('messages').select('id,conversation_id,sender_id,body,image_path,created_at').in('conversation_id', chats.map((row: Conversation) => row.id)).order('created_at', { ascending: false }).limit(200)
        const latest = new Map<string, Message>()
        for (const message of (recent ?? []) as Message[]) if (!latest.has(message.conversation_id)) latest.set(message.conversation_id, message)
        for (const chat of chats) chat.lastMessage = latest.get(chat.id)
      }
      if (!cancelled) setConversations(chats.sort((a: Conversation, b: Conversation) => (b.lastMessage?.created_at ?? b.updated_at).localeCompare(a.lastMessage?.created_at ?? a.updated_at)))
    }
    loadAccount().catch((caught) => { if (!cancelled) setError(readableError(caught)) })
    const presence = client.channel(`milly-presence:${user.id}`, { config: { private: true, presence: { key: user.id } } }).subscribe(async (status) => { if (status === 'SUBSCRIBED') await presence.track({ online_at: new Date().toISOString() }) })
    const accountRefresh = window.setInterval(() => {
      loadAccount().catch((caught) => { if (!cancelled) setError(readableError(caught)) })
    }, 5000)
    const accountChannel = client.channel(`account:${user.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'friend_requests', filter: `receiver_id=eq.${user.id}` }, () => loadAccount().catch((caught) => { if (!cancelled) setError(readableError(caught)) }))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'friendships' }, () => loadAccount().catch((caught) => { if (!cancelled) setError(readableError(caught)) }))
      .subscribe((status, failure) => {
        if (status === 'SUBSCRIBED') {
          loadAccount().catch((caught) => { if (!cancelled) setError(readableError(caught)) })
        }
        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          setError(failure instanceof Error ? `Не удалось подключиться к обновлениям друзей: ${failure.message}` : 'Не удалось подключиться к обновлениям друзей. Проверьте публикацию friend_requests и friendships в Supabase Realtime.')
        }
      })
    return () => {
      cancelled = true
      window.clearInterval(accountRefresh)
      void client.removeChannel(presence)
      void client.removeChannel(accountChannel)
    }
  }, [client, user?.id])

  useEffect(() => {
    if (!client || !user) return
    const channels = friends.map((friend) => {
      const channel = client.channel(`milly-presence:${friend.id}`, { config: { private: true, presence: { key: friend.id } } })
        .on('presence', { event: 'sync' }, () => {
          setOnline((current) => {
            const next = new Set(current)
            if (Object.keys(channel.presenceState()).length) next.add(friend.id)
            else next.delete(friend.id)
            return next
          })
        }).subscribe()
      return channel
    })
    return () => { for (const channel of channels) void client.removeChannel(channel) }
  }, [client, user?.id, friends])

  useEffect(() => {
    if (!client || dialog !== 'friends' || friendId.trim().length < 2) {
      setFriendMatches([])
      setFriendSearching(false)
      return
    }
    let cancelled = false
    setFriendMatches([])
    setFriendSearching(true)
    const timer = window.setTimeout(async () => {
      try {
        const { data, error: failure } = await client.rpc('search_users', { lookup_query: friendId.trim() })
        if (cancelled) return
        if (failure) throw failure
        setFriendMatches(((data ?? []) as Profile[]).filter((candidate) => !friends.some((friend) => friend.id === candidate.id)))
      } catch (caught) {
        if (!cancelled) setError(readableError(caught))
      } finally {
        if (!cancelled) setFriendSearching(false)
      }
    }, 220)
    return () => { cancelled = true; window.clearTimeout(timer) }
  }, [client, dialog, friendId, friends])

  useEffect(() => {
    if (!client || !user || !active) { setMessages([]); return }
    let cancelled = false
    const realtimeMessages = new Map<string, Message>()
    setMessages([]); setLoadingMessages(true)
    const load = async (keepCurrent = false) => {
      const { data, error: failure } = await client.from('messages').select('id,conversation_id,sender_id,body,image_path,created_at').eq('conversation_id', active.id).order('created_at', { ascending: false }).limit(pageSize)
      if (cancelled) return
      if (failure) { setError(readableError(failure)); setLoadingMessages(false); return }
      const rows = ((data ?? []) as Message[]).reverse(); const enriched = await signedImages(rows)
      if (cancelled) return
      setMessages((current) => {
        const merged = new Map<string, Message>()
        for (const message of [...(keepCurrent ? current : []), ...enriched, ...realtimeMessages.values()]) merged.set(message.id, message)
        return [...merged.values()].sort((a, b) => a.created_at.localeCompare(b.created_at))
      })
      const lastMessage = enriched[enriched.length - 1]
      if (lastMessage) {
        setConversations((current) => current.map((row) => row.id === active.id ? { ...row, lastMessage, updated_at: lastMessage.created_at } : row)
          .sort((a, b) => (b.lastMessage?.created_at ?? b.updated_at).localeCompare(a.lastMessage?.created_at ?? a.updated_at)))
      }
      setHasOlder(rows.length === pageSize); setLoadingMessages(false)
      if (!keepCurrent) requestAnimationFrame(() => scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight }))
    }
    load().catch((caught) => { if (!cancelled) { setError(readableError(caught)); setLoadingMessages(false) } })
    let messageRefresh: number | undefined
    const channel = client.channel(`messages:${active.id}`).on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages', filter: `conversation_id=eq.${active.id}` }, async ({ new: raw }) => {
      const [message] = await signedImages([raw as Message])
      if (cancelled) return
      realtimeMessages.set(message.id, message)
      setMessages((current) => current.some((row) => row.id === message.id) ? current : [...current, message])
      setConversations((current) => current.map((row) => row.id === active.id ? { ...row, lastMessage: message, updated_at: message.created_at } : row).sort((a, b) => (b.lastMessage?.created_at ?? b.updated_at).localeCompare(a.lastMessage?.created_at ?? a.updated_at)))
      requestAnimationFrame(() => scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' }))
    }).subscribe((status, failure) => {
      if (status === 'SUBSCRIBED') {
        if (messageRefresh) { window.clearInterval(messageRefresh); messageRefresh = undefined }
        void load(true).catch((caught) => { if (!cancelled) setError(readableError(caught)) })
      }
      if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
        setError(failure instanceof Error ? `Realtime сообщений отключён: ${failure.message}` : 'Realtime сообщений недоступен. Проверяем новые сообщения автоматически.')
        if (!messageRefresh) messageRefresh = window.setInterval(() => { void load(true).catch((caught) => { if (!cancelled) setError(readableError(caught)) }) }, 2500)
      }
    })
    return () => {
      cancelled = true
      if (messageRefresh) window.clearInterval(messageRefresh)
      void client.removeChannel(channel)
    }
  }, [client, user?.id, active?.id])

  useEffect(() => {
    if (!client || !user) return
    const channel = client.channel(`calls:${user.id}`).on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'call_signals', filter: `to_uid=eq.${user.id}` }, async ({ new: raw }) => {
      const signal = raw as CallSignal
      if (signal.kind === 'offer') {
        if (callBusy.current) { await client.from('call_signals').insert({ call_id: signal.call_id, from_uid: user.id, to_uid: signal.from_uid, kind: 'reject', payload: null }); return }
        callBusy.current = true; pendingOffer.current = { callId: signal.call_id, from: signal.from_uid, offer: signal.payload as RTCSessionDescriptionInit }
        setIncomingFrom(friendsRef.current.find((friend) => friend.id === signal.from_uid)?.display_name ?? 'Ваш друг'); setCallPhase('incoming')
        window.clearTimeout(callTimeout.current)
        callTimeout.current = window.setTimeout(() => { if (pendingOffer.current?.callId === signal.call_id) { void finishCall(true); setNotice('Входящий звонок пропущен.') } }, 45000)
      } else if (callRef.current?.id === signal.call_id || pendingOffer.current?.callId === signal.call_id) {
        if (signal.kind === 'answer' && peerConnection.current) {
          await peerConnection.current.setRemoteDescription(signal.payload as RTCSessionDescriptionInit); setCallPhase('connecting')
          for (const candidate of pendingCandidates.current.splice(0)) await peerConnection.current.addIceCandidate(candidate)
        } else if (signal.kind === 'ice' && signal.payload) {
          if (peerConnection.current?.remoteDescription) await peerConnection.current.addIceCandidate(signal.payload as RTCIceCandidateInit)
          else pendingCandidates.current.push(signal.payload as RTCIceCandidateInit)
        } else if (signal.kind === 'reject' || signal.kind === 'hangup') { await finishCall(false); setNotice(signal.kind === 'reject' ? 'Собеседник не смог ответить.' : 'Звонок завершён.') }
      }
    }).subscribe()
    return () => { void client.removeChannel(channel) }
  }, [client, user?.id])

  useEffect(() => {
    if (callPhase !== 'connected') return
    const started = Date.now(); const timer = window.setInterval(() => setCallDuration(Math.floor((Date.now() - started) / 1000)), 1000)
    return () => window.clearInterval(timer)
  }, [callPhase])

  async function signedImages(rows: Message[]) {
    if (!client) return rows
    return Promise.all(rows.map(async (row) => {
      if (!row.image_path) return row
      const { data } = await client.storage.from('milly-media').createSignedUrl(row.image_path, 3600)
      return { ...row, image_url: data?.signedUrl }
    }))
  }

  async function openChat(friend: Profile) {
    if (!client || !user) return
    setError('')
    const { data, error: failure } = await client.rpc('get_or_create_dm', { peer_uid: friend.id })
    if (failure) { setError(readableError(failure)); return }
    const conversation = conversations.find((row) => row.id === data) ?? { id: data as string, user_low: user.id < friend.id ? user.id : friend.id, user_high: user.id < friend.id ? friend.id : user.id, updated_at: new Date().toISOString(), peer: friend }
    if (!conversations.some((row) => row.id === conversation.id)) setConversations((current) => [conversation, ...current])
    setActive(conversation); setDialog(null); setSection('chats'); setNotice('')
  }

  async function addFriend(target: Profile) {
    if (!client || !user || !profile) return
    setFriendBusy(true); setError(''); setNotice('')
    try {
      if (target.id === profile.id) throw new Error('Нельзя добавить самого себя.')
      if (friends.some((friend) => friend.id === target.id)) throw new Error('Вы уже друзья.')
      const { error: insertError } = await client.from('friend_requests').insert({ sender_id: user.id, receiver_id: target.id })
      if (insertError?.code === '23505') throw new Error('Запрос уже отправлен или ожидает ответа.')
      if (insertError) throw insertError
      setNotice(`Запрос отправлен ${target.display_name}.`); setFriendId(''); setFriendMatches([])
    } catch (caught) { setError(readableError(caught)) }
    finally { setFriendBusy(false) }
  }

  async function handleRequest(request: FriendRequest, accept: boolean) {
    if (!client || !user) return
    const result = accept ? await client.rpc('accept_friend_request', { request_id: request.id }) : await client.from('friend_requests').update({ status: 'declined' }).eq('id', request.id)
    if (result.error) { setError(readableError(result.error)); return }
    setRequests((current) => current.filter((row) => row.id !== request.id))
    if (accept && request.sender) {
      const next = [...friends, request.sender]
      setFriends(next); friendsRef.current = next
      const { data: conversationId, error: conversationError } = await client.rpc('get_or_create_dm', { peer_uid: request.sender.id })
      if (conversationError) { setError(readableError(conversationError)); return }
      const conversation: Conversation = {
        id: conversationId as string,
        user_low: user.id < request.sender.id ? user.id : request.sender.id,
        user_high: user.id < request.sender.id ? request.sender.id : user.id,
        updated_at: new Date().toISOString(),
        peer: request.sender,
      }
      setConversations((current) => current.some((row) => row.id === conversation.id) ? current : [conversation, ...current])
      setActive(conversation); setSection('chats')
      setNotice('Запрос принят. Чат с другом уже открыт.')
    }
  }

  async function removeFriend(friend: Profile) {
    if (!client || !user) return
    setFriendBusy(true)
    try {
      const low = user.id < friend.id ? user.id : friend.id
      const high = user.id < friend.id ? friend.id : user.id
      const { error: failure } = await client.from('friendships').delete().eq('user_low', low).eq('user_high', high)
      if (failure) throw failure
      setFriends((current) => current.filter((row) => row.id !== friend.id))
      friendsRef.current = friendsRef.current.filter((row) => row.id !== friend.id)
      if (active?.peer.id === friend.id) setActive(null)
      setFriendToRemove(null)
      setNotice(`${friend.display_name} удалён(а) из друзей.`)
    } catch (caught) {
      setError(readableError(caught))
    } finally {
      setFriendBusy(false)
    }
  }

  async function loadOlder() {
    if (!client || !active || !messages.length || !hasOlder) return
    setLoadingMessages(true); const height = scrollRef.current?.scrollHeight ?? 0
    const { data, error: failure } = await client.from('messages').select('id,conversation_id,sender_id,body,image_path,created_at').eq('conversation_id', active.id).lt('created_at', messages[0].created_at).order('created_at', { ascending: false }).limit(pageSize)
    if (failure) setError(readableError(failure))
    else { const rows = ((data ?? []) as Message[]).reverse(); const older = await signedImages(rows); setMessages((current) => [...older, ...current]); setHasOlder(rows.length === pageSize); requestAnimationFrame(() => { if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight - height }) }
    setLoadingMessages(false)
  }

  async function sendMessage(event?: FormEvent, image?: File) {
    event?.preventDefault()
    if (!client || !user || !active || sending || (!text.trim() && !image)) return
    setSending(true); setError('')
    try {
      let imagePath: string | null = null
      if (image) {
        if (!isAllowedImage(image.type, image.size)) throw new Error('Выберите изображение JPEG, PNG, WebP, GIF или AVIF размером до 8 МБ.')
        const extension = image.name.split('.').pop()?.toLowerCase().replace(/[^a-z0-9]/g, '') || 'jpg'
        imagePath = `${active.id}/${user.id}/${crypto.randomUUID()}.${extension}`
        const { error: uploadError } = await client.storage.from('milly-media').upload(imagePath, image, { contentType: image.type })
        if (uploadError) throw uploadError
      }
      const { data, error: failure } = await client.from('messages').insert({ conversation_id: active.id, sender_id: user.id, body: text.trim() || null, image_path: imagePath }).select('id,conversation_id,sender_id,body,image_path,created_at').single()
      if (failure) throw failure
      const [message] = await signedImages([data as Message])
      setMessages((current) => current.some((row) => row.id === message.id) ? current : [...current, message])
      setConversations((current) => current.map((row) => row.id === active.id ? { ...row, lastMessage: message, updated_at: message.created_at } : row).sort((a, b) => (b.lastMessage?.created_at ?? b.updated_at).localeCompare(a.lastMessage?.created_at ?? a.updated_at)))
      setText('')
      if (composerRef.current) composerRef.current.style.height = '38px'
      requestAnimationFrame(() => scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' }))
    } catch (caught) { setError(readableError(caught)) }
    finally { setSending(false) }
  }

  async function turnServers(): Promise<RTCIceServer[]> {
    const fallback: RTCIceServer[] = [{ urls: 'stun:stun.l.google.com:19302' }]
    if (!client) return fallback
    const { data, error: failure } = await client.functions.invoke('turn-credentials')
    if (failure || !data?.iceServers?.length) { setNotice('TURN не настроен: звонок попробует прямое соединение STUN.'); return fallback }
    return [...fallback, ...data.iceServers] as RTCIceServer[]
  }

  function bindPeer(peer: RTCPeerConnection, callId: string, peerId: string) {
    peer.onicecandidate = (event) => { if (event.candidate && client && user) void client.from('call_signals').insert({ call_id: callId, from_uid: user.id, to_uid: peerId, kind: 'ice', payload: event.candidate.toJSON() }) }
    peer.ontrack = (event) => { if (audioRef.current) { audioRef.current.srcObject = event.streams[0]; void audioRef.current.play().catch(() => undefined) } }
    peer.onconnectionstatechange = () => { if (peer.connectionState === 'connected') setCallPhase('connected'); if (peer.connectionState === 'failed') { void finishCall(false); setNotice('Соединение звонка прервано.') } }
    for (const track of localStream.current?.getTracks() ?? []) peer.addTrack(track, localStream.current!)
  }

  async function startCall(friend: Profile) {
    if (!client || !user || callBusy.current) return
    callBusy.current = true; const callId = crypto.randomUUID(); callRef.current = { id: callId, peer: friend.id }; setCallPhase('calling'); setCallDuration(0); setError('')
    try {
      localStream.current = await navigator.mediaDevices.getUserMedia({ audio: true })
      const connection = new RTCPeerConnection({ iceServers: await turnServers() }); peerConnection.current = connection; bindPeer(connection, callId, friend.id)
      const offer = await connection.createOffer(); await connection.setLocalDescription(offer)
      const { error: failure } = await client.from('call_signals').insert({ call_id: callId, from_uid: user.id, to_uid: friend.id, kind: 'offer', payload: offer })
      if (failure) throw failure
      window.clearTimeout(callTimeout.current)
      callTimeout.current = window.setTimeout(() => { if (callRef.current?.id === callId && peerConnection.current?.connectionState !== 'connected') { void finishCall(true); setNotice('Собеседник не ответил.') } }, 45000)
    } catch (caught) { await finishCall(false); setError(caught instanceof DOMException && caught.name === 'NotAllowedError' ? 'Разрешите доступ к микрофону в настройках браузера.' : readableError(caught)) }
  }

  async function acceptCall() {
    if (!client || !user || !pendingOffer.current) return
    const incoming = pendingOffer.current; callRef.current = { id: incoming.callId, peer: incoming.from }; setCallPhase('connecting')
    try {
      localStream.current = await navigator.mediaDevices.getUserMedia({ audio: true })
      const connection = new RTCPeerConnection({ iceServers: await turnServers() }); peerConnection.current = connection; bindPeer(connection, incoming.callId, incoming.from)
      await connection.setRemoteDescription(incoming.offer)
      for (const candidate of pendingCandidates.current.splice(0)) await connection.addIceCandidate(candidate)
      const answer = await connection.createAnswer(); await connection.setLocalDescription(answer)
      const { error: failure } = await client.from('call_signals').insert({ call_id: incoming.callId, from_uid: user.id, to_uid: incoming.from, kind: 'answer', payload: answer })
      if (failure) throw failure
      pendingOffer.current = null
    } catch (caught) {
      await client.from('call_signals').insert({ call_id: incoming.callId, from_uid: user.id, to_uid: incoming.from, kind: 'reject', payload: null }); await finishCall(false)
      setError(caught instanceof DOMException && caught.name === 'NotAllowedError' ? 'Разрешите доступ к микрофону, чтобы принять звонок.' : readableError(caught))
    }
  }

  async function finishCall(notify = true) {
    const current = callRef.current ?? pendingOffer.current
    window.clearTimeout(callTimeout.current)
    const callId = current && ('peer' in current ? current.id : current.callId)
    if (notify && current && callId && client && user) await client.from('call_signals').insert({ call_id: callId, from_uid: user.id, to_uid: 'peer' in current ? current.peer : current.from, kind: 'hangup', payload: null })
    peerConnection.current?.close(); peerConnection.current = null; localStream.current?.getTracks().forEach((track) => track.stop()); localStream.current = null
    if (audioRef.current) audioRef.current.srcObject = null
    callRef.current = null; pendingOffer.current = null; pendingCandidates.current = []; callBusy.current = false; setCallPhase('idle'); setMuted(false); setCallDuration(0)
  }

  async function rejectIncomingCall() {
    const incoming = pendingOffer.current
    if (client && user && incoming) await client.from('call_signals').insert({ call_id: incoming.callId, from_uid: user.id, to_uid: incoming.from, kind: 'reject', payload: null })
    await finishCall(false)
  }

  async function uploadAvatar(file?: File) {
    if (!client || !user || !profile || !file) return
    if (!isAllowedImage(file.type, file.size, 5 * 1024 * 1024)) { setError('Выберите изображение JPEG, PNG, WebP или AVIF размером до 5 МБ.'); return }
    const extension = file.name.split('.').pop()?.toLowerCase().replace(/[^a-z0-9]/g, '') || 'jpg'; const path = `${user.id}/${crypto.randomUUID()}.${extension}`
    const { error: uploadError } = await client.storage.from('milly-avatars').upload(path, file)
    if (uploadError) { setError(readableError(uploadError)); return }
    const { error: updateError } = await client.from('profiles').update({ avatar_path: path }).eq('id', user.id)
    if (updateError) { setError(readableError(updateError)); return }
    setProfile({ ...profile, avatar_path: path }); const { data } = await client.storage.from('milly-avatars').createSignedUrl(path, 3600); setOwnAvatar(data?.signedUrl ?? ''); setNotice('Фотография профиля обновлена.')
  }

  async function saveName(event: FormEvent) {
    event.preventDefault()
    if (!client || !user || !profile) return
    const formData = new FormData(event.currentTarget as HTMLFormElement)
    const name = formData.get('display_name')?.toString().trim()
    if (!name || name.length > 40) { setError('Имя должно содержать от 1 до 40 символов.'); return }
    try {
      const username = usernameSchema.parse(formData.get('username')?.toString() ?? '')
      const { error: failure } = await client.from('profiles').update({ display_name: name, username }).eq('id', user.id)
      if (failure?.code === '23505') throw new Error('Этот юзернейм уже занят.')
      if (failure) throw failure
      setProfile({ ...profile, display_name: name, username }); setNotice('Профиль сохранён.')
    } catch (caught) { setError(readableError(caught)) }
  }

  async function copyId() { if (profile) { await navigator.clipboard.writeText(`#${profile.user_number}`); setNotice('ID скопирован.') } }
  async function copyUsername() { if (profile) { await navigator.clipboard.writeText(`@${profile.username}`); setNotice('Юзернейм скопирован.') } }
  function composerKey(event: KeyboardEvent<HTMLTextAreaElement>) { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); void sendMessage() } }

  if (authLoading) return <div className="loading-screen"><span className="brand-mark"><MessageCircle size={17} /></span><LoaderCircle className="spin" size={19} /></div>
  if (!isSupabaseConfigured) return <SetupScreen />
  if (!session) return <AuthScreen />
  const query = search.toLowerCase()
  const visibleChats = conversations.filter((row) => row.peer.display_name.toLowerCase().includes(query) || row.peer.username.includes(query.replace(/^@/, '')) || `#${row.peer.user_number}`.includes(query.replace(/^#/, '')))
  const visibleFriends = friends.filter((friend) => friend.display_name.toLowerCase().includes(query) || friend.username.includes(query.replace(/^@/, '')) || `#${friend.user_number}`.includes(query.replace(/^#/, '')))
  const peer = active?.peer

  return <main className="messenger-shell"><aside className="sidebar">
    <div className="sidebar-top"><div className="brand"><span className="brand-mark"><MessageCircle size={17} strokeWidth={2.4} /></span><span>milly</span><span className="brand-dot">.</span></div><span className="network-status" title={connected ? 'Подключено' : 'Нет подключения'}>{connected ? <Wifi size={15} /> : <WifiOff size={15} />}</span></div>
    <label className="search-box"><Search size={16} /><input placeholder="Найти разговор" value={search} onChange={(event) => setSearch(event.target.value)} /><kbd>⌘ K</kbd></label>
    <div className="sidebar-section-heading"><span>ВАШЕ ПРОСТРАНСТВО</span><button className="icon-button" title="Добавить друга" aria-label="Добавить друга" onClick={() => setDialog('friends')}><Plus size={17} /></button></div>
    <nav className="section-tabs" aria-label="Разделы"><button className={section === 'chats' ? 'selected' : ''} onClick={() => setSection('chats')}><MessageCircle size={16} /> Разговоры <span>{conversations.length || ''}</span></button><button className={section === 'friends' ? 'selected' : ''} onClick={() => setSection('friends')}><Users size={16} /> Друзья <span>{friends.length || ''}</span></button></nav>
    {section === 'chats' ? <div className="contact-list">{visibleChats.length ? visibleChats.map((chat) => <button className={`contact-row${active?.id === chat.id ? ' active' : ''}`} key={chat.id} onClick={() => { setActive(chat); setError('') }}><Avatar name={chat.peer.display_name} online={online.has(chat.peer.id)} image={chat.peer.avatar_url} /><span className="contact-copy"><span className="contact-name">{chat.peer.display_name}</span><span className="contact-preview">{chat.lastMessage?.image_path ? 'Фотография' : chat.lastMessage?.body || 'Начните разговор'}</span></span>{chat.lastMessage && <span className="contact-time">{displayDate(chat.lastMessage.created_at)}</span>}</button>) : <EmptyList icon={<MessageCircle size={17} />} title="Разговоров пока нет" action="Найти друга" onClick={() => setDialog('friends')} />}</div> : <div className="contact-list">{requests.length > 0 && <div className="request-group"><span className="request-label">ЗАПРОСЫ · {requests.length}</span>{requests.map((request) => <RequestRow key={request.id} request={request} onHandle={handleRequest} />)}</div>}{visibleFriends.map((friend) => <button className="contact-row" key={friend.id} onClick={() => void openChat(friend)}><Avatar name={friend.display_name} online={online.has(friend.id)} image={friend.avatar_url} /><span className="contact-copy"><span className="contact-name">{friend.display_name}</span><span className="contact-preview">{online.has(friend.id) ? 'В сети' : `#${friend.user_number} · @${friend.username}`}</span></span></button>)}{!visibleFriends.length && !requests.length && <EmptyList icon={<Users size={17} />} title="Здесь будут ваши друзья" action="Добавить друга" onClick={() => setDialog('friends')} />}</div>}
    <div className="sidebar-bottom">{installPrompt && <button className="install-button" onClick={() => void installPrompt.prompt?.()}>Установить Milly</button>}<button className="profile-control" onClick={() => setDialog('profile')}><Avatar name={profile?.display_name ?? 'M'} image={ownAvatar} /><span className="contact-copy"><span className="contact-name">{profile?.display_name ?? 'Профиль'}</span><span className="contact-preview">{profile ? `#${profile.user_number} · @${profile.username}` : 'Настроить'}</span></span><Settings2 size={16} /></button></div>
  </aside>

  <section className="chat-pane">{active && peer ? <>
    <header className="chat-header"><button className="icon-button mobile-back" aria-label="Назад" onClick={() => setActive(null)}><ArrowLeft size={18} /></button><Avatar name={peer.display_name} online={online.has(peer.id)} large image={peer.avatar_url} /><div className="chat-person"><strong>{peer.display_name}</strong><span>{online.has(peer.id) ? 'В сети' : 'Был(а) недавно'}</span></div><div className="header-actions"><button className="icon-button call-button" title="Голосовой звонок" aria-label="Позвонить" onClick={() => void startCall(peer)}><Phone size={18} /></button><button className="icon-button" title="Удалить из друзей" aria-label="Удалить из друзей" onClick={() => setFriendToRemove(peer)}><MoreHorizontal size={19} /></button></div></header>
    <div className="messages-scroll" ref={scrollRef}>{loadingMessages && <div className="history-loading"><LoaderCircle className="spin" size={16} /> Загружаем разговор</div>}{hasOlder && !loadingMessages && <button className="older-button" onClick={() => void loadOlder()}>Показать предыдущие сообщения</button>}{messages.length === 0 && !loadingMessages ? <div className="chat-begin"><div className="begin-icon"><MessageCircle size={24} /></div><span>СЕЙЧАС ВЫ ЗДЕСЬ</span><h2>Начало хорошего<br />разговора.</h2><p>Напишите {peer.display_name}, и это место станет вашим.</p></div> : <div className="message-list">{messages.map((message, index) => {
      const mine = message.sender_id === user?.id; const previous = messages[index - 1]
      const groupStart = !previous || previous.sender_id !== message.sender_id || new Date(message.created_at).getTime() - new Date(previous.created_at).getTime() > 300000
      return <div className={`message-row${mine ? ' mine' : ''}${groupStart ? ' group-start' : ''}`} key={message.id}>{!mine && groupStart && <Avatar name={peer.display_name} />}{!mine && !groupStart && <span className="avatar-spacer" />}<div className="message-content">{message.image_url && <button className="message-image" title="Открыть фотографию" onClick={() => window.open(message.image_url, '_blank', 'noopener,noreferrer')}><img src={message.image_url} alt="Фотография в сообщении" loading="lazy" /></button>}{message.body && <div className="message-bubble">{message.body}</div>}<span className="message-meta">{clock(message.created_at)}{mine && <CheckCheck size={13} />}</span></div></div>
    })}</div>}</div>
    <form className="composer" onSubmit={(event) => void sendMessage(event)}><input ref={fileRef} type="file" accept="image/*" hidden onChange={(event) => { const file = event.target.files?.[0]; if (file) void sendMessage(undefined, file); event.target.value = '' }} /><button type="button" className="icon-button attach-button" title="Прикрепить фотографию" aria-label="Прикрепить фотографию" onClick={() => fileRef.current?.click()}><ImagePlus size={19} /></button><textarea ref={composerRef} value={text} onChange={(event) => { const textarea = event.currentTarget; setText(textarea.value); textarea.style.height = 'auto'; textarea.style.height = `${Math.min(textarea.scrollHeight, 160)}px` }} onKeyDown={composerKey} placeholder="Напишите сообщение…" rows={1} maxLength={4000} aria-label="Текст сообщения" /><button type="submit" className="send-button" disabled={sending || !text.trim()} aria-label="Отправить сообщение">{sending ? <LoaderCircle className="spin" size={17} /> : <Send size={17} />}</button></form>
  </> : <div className="welcome-pane"><span className="welcome-overline">ТИШЕ. БЛИЖЕ. ПРОЩЕ.</span><div className="welcome-orbit"><span className="orbit-small orbit-one" /><span className="orbit-small orbit-two" /><span className="welcome-mark"><MessageCircle size={27} strokeWidth={1.7} /></span></div><h1>Хорошие разговоры<br />начинаются <em>здесь.</em></h1><p>Выберите друга и напишите ему. Остальное подождёт.</p><button className="primary-button welcome-button" onClick={() => setDialog('friends')}><Users size={16} /> Добавить друга</button><div className="welcome-foot"><span />{friends.length ? `${friends.length} ${friends.length === 1 ? 'друг' : 'друзей'} рядом` : 'Ваш круг только начинается'}<span /></div></div>}</section>

  {error && <Toast message={error} error onClose={() => setError('')} />}{notice && <Toast message={notice} onClose={() => setNotice('')} />}
  {dialog === 'friends' && <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setDialog(null) }}><section className="modal" role="dialog" aria-modal="true" aria-labelledby="friend-title"><div className="modal-heading"><div><span className="form-kicker">ПОПОЛНИТЬ СВОЙ КРУГ</span><h2 id="friend-title">Найти друга</h2></div><button className="icon-button" aria-label="Закрыть" onClick={() => setDialog(null)}><X size={18} /></button></div><p>Ищите по статическому ID или началу юзернейма. Начните вводить — подходящие аккаунты появятся сразу.</p><form className="add-friend-form" onSubmit={(event) => { event.preventDefault(); if (friendMatches.length === 1) void addFriend(friendMatches[0]); else setNotice('Выберите пользователя из списка.') }}><label htmlFor="friend-id">@USERNAME ИЛИ #ID</label><div><input id="friend-id" value={friendId} onChange={(event) => { setFriendId(event.target.value); setError(''); setNotice('') }} placeholder="Введите @username" autoFocus autoComplete="off" required /><button className="primary-button" disabled={friendBusy || friendMatches.length !== 1}>{friendBusy ? <LoaderCircle className="spin" size={16} /> : <Plus size={16} />} Отправить запрос</button></div></form>{friendSearching ? <p className="friend-search-empty">Ищем пользователей…</p> : friendMatches.length > 0 ? <div className="friend-suggestions" role="listbox" aria-label="Результаты поиска">{friendMatches.map((candidate) => <button key={candidate.id} type="button" className="friend-suggestion" role="option" aria-selected="false" disabled={friendBusy} onClick={() => void addFriend(candidate)}><Avatar name={candidate.display_name} image={candidate.avatar_url} /><span className="friend-suggestion-copy"><strong>{candidate.display_name}</strong><span>#{candidate.user_number} · @{candidate.username}</span></span><Plus size={16} /></button>)}</div> : friendId.trim().length >= 2 && <p className="friend-search-empty">Подходящих пользователей не найдено.</p>}<div className="profile-identifiers"><div className="my-id"><span>ВАШ ID</span><strong>#{profile?.user_number}</strong><button className="icon-button" title="Скопировать ID" aria-label="Скопировать ID" onClick={() => void copyId()}><Copy size={16} /></button></div><div className="my-id"><span>ЮЗЕРНЕЙМ</span><strong>@{profile?.username}</strong><button className="icon-button" title="Скопировать юзернейм" aria-label="Скопировать юзернейм" onClick={() => void copyUsername()}><Copy size={16} /></button></div></div>{requests.length > 0 && <div className="modal-requests"><span className="request-label">ВХОДЯЩИЕ ЗАПРОСЫ</span>{requests.map((request) => <RequestRow key={request.id} request={request} onHandle={handleRequest} />)}</div>}</section></div>}
  {dialog === 'profile' && profile && <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setDialog(null) }}><section className="modal profile-modal" role="dialog" aria-modal="true" aria-labelledby="profile-title"><div className="modal-heading"><div><span className="form-kicker">ВАШЕ ПРОСТРАНСТВО</span><h2 id="profile-title">Профиль</h2></div><button className="icon-button" aria-label="Закрыть" onClick={() => setDialog(null)}><X size={18} /></button></div><div className="profile-photo"><button className="photo-button" onClick={() => avatarRef.current?.click()}><Avatar name={profile.display_name} large image={ownAvatar} /><span><ImagePlus size={14} /></span></button><span>Добавить фотографию</span><input ref={avatarRef} type="file" accept="image/*" hidden onChange={(event) => { void uploadAvatar(event.target.files?.[0]); event.target.value = '' }} /></div><form className="profile-edit" onSubmit={(event) => void saveName(event)}><label>Имя<input name="display_name" defaultValue={profile.display_name} maxLength={40} required /></label><label>Юзернейм<input name="username" defaultValue={profile.username} minLength={3} maxLength={24} pattern="[a-zA-Z0-9_]+" autoCapitalize="off" autoComplete="off" spellCheck={false} required /></label><button className="primary-button">Сохранить профиль</button></form><div className="profile-identifiers"><div className="my-id"><span>СТАТИЧЕСКИЙ ID</span><strong>#{profile.user_number}</strong><button className="icon-button" title="Скопировать ID" aria-label="Скопировать ID" onClick={() => void copyId()}><Copy size={16} /></button></div><div className="my-id"><span>ЮЗЕРНЕЙМ</span><strong>@{profile.username}</strong><button className="icon-button" title="Скопировать юзернейм" aria-label="Скопировать юзернейм" onClick={() => void copyUsername()}><Copy size={16} /></button></div></div><button className="signout-button" onClick={() => { void finishCall(false); void client?.auth.signOut(); setDialog(null) }}><LogOut size={16} /> Выйти из аккаунта</button></section></div>}
  {friendToRemove && <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget && !friendBusy) setFriendToRemove(null) }}><section className="modal" role="alertdialog" aria-modal="true" aria-labelledby="remove-friend-title"><div className="modal-heading"><div><span className="form-kicker">ПОДТВЕРЖДЕНИЕ</span><h2 id="remove-friend-title">Удалить из друзей?</h2></div><button className="icon-button" aria-label="Закрыть" disabled={friendBusy} onClick={() => setFriendToRemove(null)}><X size={18} /></button></div><p>{friendToRemove.display_name} исчезнет из списка друзей. История переписки останется.</p><div className="confirm-actions"><button type="button" className="secondary-button" disabled={friendBusy} onClick={() => setFriendToRemove(null)}>Отмена</button><button type="button" className="primary-button danger-button" disabled={friendBusy} onClick={() => void removeFriend(friendToRemove)}>{friendBusy ? <LoaderCircle className="spin" size={16} /> : null}Удалить из друзей</button></div></section></div>}
  {callPhase !== 'idle' && <CallWindow phase={callPhase} peerName={callPhase === 'incoming' ? incomingFrom : friends.find((friend) => friend.id === callRef.current?.peer)?.display_name ?? 'Друг'} duration={callDuration} muted={muted} onAccept={() => void acceptCall()} onMute={() => { const next = !muted; setMuted(next); localStream.current?.getAudioTracks().forEach((track) => { track.enabled = !next }) }} onEnd={() => callPhase === 'incoming' ? void rejectIncomingCall() : void finishCall()} />}
  <audio ref={audioRef} autoPlay /></main>
}

function SetupScreen() {
  return <main className="setup-page"><div className="brand"><span className="brand-mark"><MessageCircle size={17} /></span><span>milly</span><span className="brand-dot">.</span></div><div className="setup-card"><span className="setup-symbol"><Settings2 size={21} /></span><span className="form-kicker">ПОСЛЕДНИЙ ШАГ НАСТРОЙКИ</span><h1>Milly готовится к встрече.</h1><p>Добавьте адрес и публичный ключ проекта Supabase в файл <code>.env.local</code>, затем перезапустите приложение.</p><pre>VITE_SUPABASE_URL=https://…supabase.co<br />VITE_SUPABASE_ANON_KEY=ваш_публичный_ключ</pre><span className="setup-foot"><CircleHelp size={15} /> Подробный путь описан в README.md</span></div><span className="setup-caption">ЛИЧНОЕ ПРОСТРАНСТВО · ВАШИ ПРАВИЛА</span></main>
}

function EmptyList({ icon, title, action, onClick }: { icon: React.ReactNode; title: string; action: string; onClick: () => void }) {
  return <div className="list-empty"><span className="empty-icon">{icon}</span><span>{title}</span><button onClick={onClick}>{action}</button></div>
}

function RequestRow({ request, onHandle }: { request: FriendRequest; onHandle: (request: FriendRequest, accept: boolean) => Promise<void> }) {
  return <div className="request-row"><Avatar name={request.sender?.display_name ?? '?'} image={request.sender?.avatar_url} /><span className="contact-copy"><span className="contact-name">{request.sender?.display_name ?? 'Участник'}</span><span className="contact-preview">{request.sender?.milly_id ?? 'Хочет дружить'}</span></span><button className="request-accept" aria-label="Принять запрос" onClick={() => void onHandle(request, true)}><Check size={16} /></button><button className="request-decline" aria-label="Отклонить запрос" onClick={() => void onHandle(request, false)}><X size={15} /></button></div>
}

function Toast({ message, error = false, onClose }: { message: string; error?: boolean; onClose: () => void }) {
  return <div className={`toast${error ? ' toast-error' : ''}`} role={error ? 'alert' : 'status'}><span>{message}</span><button aria-label="Закрыть" onClick={onClose}><X size={15} /></button></div>
}

function CallWindow({ phase, peerName, duration, muted, onAccept, onMute, onEnd }: { phase: CallPhase; peerName: string; duration: number; muted: boolean; onAccept: () => void; onMute: () => void; onEnd: () => void }) {
  const label = phase === 'incoming' ? 'ВХОДЯЩИЙ ЗВОНОК' : phase === 'calling' ? 'ВЫЗЫВАЕМ' : phase === 'connecting' ? 'СОЕДИНЕНИЕ' : 'РАЗГОВОР'
  return <div className="call-overlay"><div className="call-card"><button className="call-close" aria-label="Завершить звонок" onClick={onEnd}><X size={17} /></button><Avatar name={peerName} large /><span className="call-state">{label}</span><h2>{peerName}</h2><p>{phase === 'connected' ? `${String(Math.floor(duration / 60)).padStart(2, '0')}:${String(duration % 60).padStart(2, '0')}` : phase === 'incoming' ? 'Хочет поговорить с вами' : 'Голосовой звонок Milly'}</p><div className="call-actions">{phase === 'incoming' && <button className="accept-call" aria-label="Принять звонок" onClick={onAccept}><Phone size={20} /></button>}{(phase === 'connected' || phase === 'connecting') && <button className={`mute-call${muted ? ' muted' : ''}`} aria-label={muted ? 'Включить микрофон' : 'Выключить микрофон'} onClick={onMute}><span>{muted ? '×' : '·'}</span></button>}<button className="end-call" aria-label={phase === 'incoming' ? 'Отклонить звонок' : 'Завершить звонок'} onClick={onEnd}><Phone size={20} /></button></div><span className="call-encryption-note"><ShieldCheck size={13} /> Прямой WebRTC-звонок · не E2EE</span></div></div>
}