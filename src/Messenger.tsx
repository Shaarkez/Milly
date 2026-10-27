import { Fragment, lazy, Suspense, useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from 'react'
import type { Session } from '@supabase/supabase-js'
import { ArrowLeft, AtSign, BadgeCheck, CalendarDays, Check, CheckCheck, CircleHelp, Copy, Hash, ImagePlus, LoaderCircle, LogOut, Maximize2, MessageCircle, Mic, MicOff, Minimize2, MoreHorizontal, Phone, Plus, Search, Send, Settings2, ShieldCheck, SlidersHorizontal, Users, Video, VideoOff, Volume2, VolumeX, Wifi, WifiOff, X } from 'lucide-react'
import { isSupabaseConfigured, pageSize, readableError, supabase } from './lib/supabase'
import type { CallSignal, Conversation, FriendRequest, Message, MessageReaction, Profile } from './lib/types'
import { isAllowedImage, registrationSchema, signInSchema, usernameSchema } from './lib/validation'

type Dialog = 'friends' | 'profile' | 'peer' | null
type CallPhase = 'idle' | 'calling' | 'incoming' | 'connecting' | 'connected'
type ChatFilter = 'all' | 'direct' | 'groups' | 'channels'
type PendingOffer = { callId: string; from: string; offer: RTCSessionDescriptionInit }
const ChannelsWorkspace = lazy(() => import('./ChannelsWorkspace'))
const AdminWorkspace = lazy(() => import('./AdminWorkspace'))
const ADMIN_USER_ID = '6a3ecd6f-7f0a-424a-a02d-ef133f23003a'
const colors = ['#6d8371', '#8b6a5f', '#687c91', '#927b4e', '#806d88']
const reactionChoices = ['👍', '❤️', '😂', '🔥', '😮', '😢']
const initials = (name: string) => name.trim().split(/\s+/).slice(0, 2).map((part) => part[0]).join('').toUpperCase() || '?'
const clock = (value: string) => new Intl.DateTimeFormat('ru', { hour: '2-digit', minute: '2-digit' }).format(new Date(value))
const displayDate = (value: string) => new Date(value).toDateString() === new Date().toDateString() ? clock(value) : new Intl.DateTimeFormat('ru', { day: 'numeric', month: 'short' }).format(new Date(value))
const profileDate = (value: string) => value && !Number.isNaN(new Date(value).getTime()) ? new Intl.DateTimeFormat('ru', { day: 'numeric', month: 'long', year: 'numeric' }).format(new Date(value)) : 'Не указана'
const dayLabel = (value: string) => {
  const date = new Date(value)
  const current = new Date()
  const yesterday = new Date()
  yesterday.setDate(current.getDate() - 1)
  if (date.toDateString() === current.toDateString()) return 'Сегодня'
  if (date.toDateString() === yesterday.toDateString()) return 'Вчера'
  return new Intl.DateTimeFormat('ru', { day: 'numeric', month: 'long', year: 'numeric' }).format(date)
}

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
  const [messageReactions, setMessageReactions] = useState<MessageReaction[]>([])
  const [hasOlder, setHasOlder] = useState(false)
  const [loadingMessages, setLoadingMessages] = useState(false)
  const [text, setText] = useState('')
  const [search, setSearch] = useState('')
  const [section, setSection] = useState<'chats' | 'friends' | 'channels' | 'admin'>('chats')
  const [chatFilter, setChatFilter] = useState<ChatFilter>('all')
  const [dialog, setDialog] = useState<Dialog>(null)
  const [profileToView, setProfileToView] = useState<Profile | null>(null)
  const [profilePanelOpen, setProfilePanelOpen] = useState(false)
  const [accountMenuOpen, setAccountMenuOpen] = useState(false)
  const [appearanceOpen, setAppearanceOpen] = useState(false)
  const [lightTheme, setLightTheme] = useState(() => localStorage.getItem('milly-theme') !== 'classic')
  const [friendId, setFriendId] = useState('')
  const [friendMatches, setFriendMatches] = useState<Profile[]>([])
  const [friendSearching, setFriendSearching] = useState(false)
  const [friendToRemove, setFriendToRemove] = useState<Profile | null>(null)
  const [friendBusy, setFriendBusy] = useState(false)
  const [profileSaving, setProfileSaving] = useState(false)
  const [profileDraft, setProfileDraft] = useState({ displayName: '', username: '' })
  const [notice, setNotice] = useState('')
  const [error, setError] = useState('')
  const [online, setOnline] = useState<Set<string>>(new Set())
  const [connected, setConnected] = useState(navigator.onLine)
  const [sending, setSending] = useState(false)
  const [callPhase, setCallPhase] = useState<CallPhase>('idle')
  const [callMinimized, setCallMinimized] = useState(false)
  const [callDuration, setCallDuration] = useState(0)
  const [muted, setMuted] = useState(false)
  const [remoteVolume, setRemoteVolume] = useState(0.8)
  const [audioUnlocked, setAudioUnlocked] = useState(false)
  const [videoCall, setVideoCall] = useState(false)
  const [cameraEnabled, setCameraEnabled] = useState(true)
  const [localMedia, setLocalMedia] = useState<MediaStream | null>(null)
  const [remoteMedia, setRemoteMedia] = useState<MediaStream | null>(null)
  const [incomingFrom, setIncomingFrom] = useState('')
  const [ownAvatar, setOwnAvatar] = useState('')
  const [installPrompt, setInstallPrompt] = useState<Event & { prompt?: () => Promise<void> } | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const composerRef = useRef<HTMLTextAreaElement>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const avatarRef = useRef<HTMLInputElement>(null)
  const accountMenuRef = useRef<HTMLDivElement>(null)
  const audioRef = useRef<HTMLAudioElement>(null)
  const ringtoneContext = useRef<AudioContext | null>(null)
  const localVideoRef = useRef<HTMLVideoElement>(null)
  const remoteVideoRef = useRef<HTMLVideoElement>(null)
  const peerConnection = useRef<RTCPeerConnection | null>(null)
  const localStream = useRef<MediaStream | null>(null)
  const callRef = useRef<{ id: string; peer: string } | null>(null)
  const callBusy = useRef(false)
  const turnFailure = useRef('')
  const turnTransportWarning = useRef('')
  const pendingOffer = useRef<PendingOffer | null>(null)
  const pendingCandidates = useRef<RTCIceCandidateInit[]>([])
  const callTimeout = useRef<number | undefined>(undefined)
  const friendsRef = useRef<Profile[]>([])
  const client = supabase
  const user = session?.user
  const activeMessageIds = messages.map((message) => message.id)

  useEffect(() => {
    const unlockAudio = () => {
      if (!ringtoneContext.current && typeof window.AudioContext === 'function') {
        ringtoneContext.current = new AudioContext()
      }
      if (ringtoneContext.current?.state === 'suspended') {
        void ringtoneContext.current.resume().then(() => setAudioUnlocked(true)).catch(() => undefined)
      } else if (ringtoneContext.current?.state === 'running') {
        setAudioUnlocked(true)
      }
    }
    window.addEventListener('pointerdown', unlockAudio)
    window.addEventListener('keydown', unlockAudio)
    return () => {
      window.removeEventListener('pointerdown', unlockAudio)
      window.removeEventListener('keydown', unlockAudio)
      void ringtoneContext.current?.close()
      ringtoneContext.current = null
    }
  }, [])

  useEffect(() => {
    const audio = audioRef.current
    if (audio) audio.volume = remoteVolume
  }, [remoteMedia, remoteVolume])

  useEffect(() => {
    const context = ringtoneContext.current
    if (!audioUnlocked || !context || !['calling', 'incoming'].includes(callPhase)) return
    const oscillator = context.createOscillator()
    const gain = context.createGain()
    oscillator.type = 'sine'
    oscillator.frequency.value = callPhase === 'incoming' ? 660 : 480
    gain.gain.value = 0
    oscillator.connect(gain)
    gain.connect(context.destination)
    oscillator.start()
    const ring = () => {
      const now = context.currentTime
      gain.gain.cancelScheduledValues(now)
      gain.gain.setValueAtTime(0, now)
      gain.gain.linearRampToValueAtTime(0.12, now + 0.04)
      gain.gain.setValueAtTime(0.12, now + 0.42)
      gain.gain.linearRampToValueAtTime(0, now + 0.48)
    }
    ring()
    const timer = window.setInterval(ring, 1800)
    return () => {
      window.clearInterval(timer)
      oscillator.stop()
      oscillator.disconnect()
      gain.disconnect()
    }
  }, [audioUnlocked, callPhase])

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
    localStorage.setItem('milly-theme', lightTheme ? 'light' : 'classic')
    document.documentElement.dataset.millyTheme = lightTheme ? 'light' : 'classic'
    document.body.classList.toggle('milly-dark', !lightTheme)
  }, [lightTheme])

  useEffect(() => {
    if (!accountMenuOpen) return
    const closeOutside = (event: MouseEvent) => {
      if (event.target instanceof Node && !accountMenuRef.current?.contains(event.target)) setAccountMenuOpen(false)
    }
    const closeEscape = (event: globalThis.KeyboardEvent) => {
      if (event.key === 'Escape') setAccountMenuOpen(false)
    }
    document.addEventListener('mousedown', closeOutside)
    document.addEventListener('keydown', closeEscape)
    return () => {
      document.removeEventListener('mousedown', closeOutside)
      document.removeEventListener('keydown', closeEscape)
    }
  }, [accountMenuOpen])

  useEffect(() => {
    if (!client || !user) return
    let cancelled = false
    setOwnAvatar('')
    const loadAccount = async () => {
      const [{ data: own, error: ownError }, { data: links, error: linksError }, { data: requestRows, error: requestError }] = await Promise.all([
        client.from('profiles').select('id,milly_id,user_number,username,display_name,avatar_path,is_verified,registration_date_override,created_at').eq('id', user.id).single(),
        client.from('friendships').select('user_low,user_high').or(`user_low.eq.${user.id},user_high.eq.${user.id}`),
        client.from('friend_requests').select('id,sender_id,receiver_id,created_at').eq('receiver_id', user.id).eq('status', 'pending'),
      ])
      if (cancelled) return
      if (ownError || linksError || requestError) { setError(readableError(ownError || linksError || requestError)); return }
      const { data: ownAliases, error: ownAliasesError } = await client.from('profile_aliases').select('username').eq('user_id', user.id)
      if (cancelled) return
      if (ownAliasesError) { setError(readableError(ownAliasesError)); return }
      setProfile({ ...own, aliases: (ownAliases ?? []).map((alias: { username: string }) => alias.username) } as Profile)
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
      const [{ data: people, error: peopleError }, { data: aliases, error: aliasesError }, { data: convoRows, error: convoError }] = await Promise.all([
        allIds.length ? client.from('profiles').select('id,milly_id,user_number,username,display_name,avatar_path,is_verified,registration_date_override,created_at').in('id', allIds) : Promise.resolve({ data: [], error: null }),
        allIds.length ? client.from('profile_aliases').select('user_id,username').in('user_id', allIds) : Promise.resolve({ data: [], error: null }),
        friendIds.length ? client.from('conversations').select('id,user_low,user_high,updated_at').or(`user_low.eq.${user.id},user_high.eq.${user.id}`) : Promise.resolve({ data: [], error: null }),
      ])
      if (cancelled) return
      if (peopleError || aliasesError || convoError) { setError(readableError(peopleError || aliasesError || convoError)); return }
      const aliasesById = new Map<string, string[]>()
      for (const alias of aliases ?? []) aliasesById.set(alias.user_id, [...(aliasesById.get(alias.user_id) ?? []), alias.username])
      const profiles = await Promise.all((people ?? []).map(async (row: Profile) => {
        const person = { ...row, aliases: aliasesById.get(row.id) ?? [] }
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
    }, 15000)
    const accountChannel = client.channel(`account:${user.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'friend_requests', filter: `receiver_id=eq.${user.id}` }, () => loadAccount().catch((caught) => { if (!cancelled) setError(readableError(caught)) }))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'friendships' }, () => loadAccount().catch((caught) => { if (!cancelled) setError(readableError(caught)) }))
      .subscribe((status, failure) => {
        if (status === 'SUBSCRIBED') {
          setNotice((current) => current.startsWith('Realtime друзей недоступен') ? '' : current)
          loadAccount().catch((caught) => { if (!cancelled) setError(readableError(caught)) })
        }
        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          const reason = failure instanceof Error ? ` Причина: ${failure.message}` : ''
          setNotice(`Realtime друзей недоступен; список обновляется автоматически каждые 15 секунд.${reason}`)
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
        setError((current) => current.startsWith('Realtime сообщений отключён:') || current.startsWith('Realtime сообщений недоступен.') ? '' : current)
        setNotice((current) => current.startsWith('Realtime сообщений проверяются автоматически') ? '' : current)
        void load(true).catch((caught) => { if (!cancelled) setError(readableError(caught)) })
      }
      if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
        setNotice(failure instanceof Error ? `Realtime сообщений проверяются автоматически. Причина: ${failure.message}` : 'Realtime сообщений проверяются автоматически с резервным обновлением.')
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
    if (!client || !active) {
      setMessageReactions([])
      return
    }
    if (!activeMessageIds.length) {
      setMessageReactions([])
      return
    }
    let cancelled = false
    let loading = false
    const refresh = async () => {
      if (cancelled || loading) return
      loading = true
      try {
        const { data, error: failure } = await client
          .from('message_reactions')
          .select('id,message_id,channel_message_id,user_id,emoji')
          .in('message_id', activeMessageIds)
        if (failure) throw failure
        if (!cancelled) setMessageReactions((data ?? []) as MessageReaction[])
      } catch (caught) {
        if (!cancelled) setError(readableError(caught))
      } finally {
        loading = false
      }
    }
    void refresh()
    const channel = client.channel(`message-reactions:${active.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'message_reactions' }, () => { void refresh() })
      .subscribe()
    const timer = window.setInterval(() => { void refresh() }, 5000)
    return () => {
      cancelled = true
      window.clearInterval(timer)
      void client.removeChannel(channel)
    }
  }, [client, active?.id, activeMessageIds.join(',')])

  useEffect(() => {
    if (!client || !user) return
    let cancelled = false
    let pollTimer: number | undefined
    let polling = false
    let signalCursor = 0
    const processedSignals = new Set<number>()
    const earlyCandidates = new Map<string, RTCIceCandidateInit[]>()
    const listenFrom = new Date().toISOString()
    const processSignal = async (signal: CallSignal) => {
      if (cancelled || processedSignals.has(signal.id)) return
      const activeCall = callRef.current?.id === signal.call_id || pendingOffer.current?.callId === signal.call_id
      if (signal.kind === 'ice' && !activeCall && signal.payload) {
        let candidates = earlyCandidates.get(signal.call_id)
        if (!candidates) {
          if (earlyCandidates.size >= 20) {
            const oldestCallId = earlyCandidates.keys().next().value
            if (oldestCallId) earlyCandidates.delete(oldestCallId)
          }
          candidates = []
          earlyCandidates.set(signal.call_id, candidates)
        }
        if (candidates.length < 32) candidates.push(signal.payload as RTCIceCandidateInit)
        processedSignals.add(signal.id)
        return
      }
      processedSignals.add(signal.id)
      if (signal.kind === 'offer') {
        if (callBusy.current) { await client.from('call_signals').insert({ call_id: signal.call_id, from_uid: user.id, to_uid: signal.from_uid, kind: 'reject', payload: null }); return }
        callBusy.current = true; pendingOffer.current = { callId: signal.call_id, from: signal.from_uid, offer: signal.payload as RTCSessionDescriptionInit }
        setVideoCall(Boolean((signal.payload as RTCSessionDescriptionInit | null)?.sdp?.includes('m=video')))
        setCameraEnabled(true)
        pendingCandidates.current = earlyCandidates.get(signal.call_id) ?? []
        earlyCandidates.delete(signal.call_id)
        setIncomingFrom(friendsRef.current.find((friend) => friend.id === signal.from_uid)?.display_name ?? 'Ваш друг'); setCallMinimized(false); setCallPhase('incoming')
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
    }
    const pollSignals = async () => {
      if (cancelled || polling) return
      polling = true
      try {
        let query = client.from('call_signals')
          .select('id,call_id,from_uid,to_uid,kind,payload')
          .eq('to_uid', user.id)
          .gte('created_at', listenFrom)
          .order('id', { ascending: true })
          .limit(100)
        if (signalCursor > 0) query = query.gt('id', signalCursor)
        const { data, error: failure } = await query
        if (failure) throw failure
        for (const raw of data ?? []) {
          const signal = raw as CallSignal
          signalCursor = Math.max(signalCursor, signal.id)
          await processSignal(signal)
        }
      } catch (caught) {
        if (!cancelled) setError((current) => current.startsWith('Не удалось проверить сигналы звонка:') ? current : `Не удалось проверить сигналы звонка: ${readableError(caught)}`)
      } finally {
        polling = false
      }
    }
    const startPolling = () => {
      if (pollTimer) return
      void pollSignals()
      pollTimer = window.setInterval(() => void pollSignals(), 1500)
    }
    const channel = client.channel(`calls:${user.id}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'call_signals', filter: `to_uid=eq.${user.id}` }, ({ new: raw }) => {
        void processSignal(raw as CallSignal).catch((caught) => { if (!cancelled) setError(readableError(caught)) })
      })
      .subscribe((status, failure) => {
        if (status === 'SUBSCRIBED') {
          if (pollTimer) {
            void pollSignals()
            window.clearInterval(pollTimer)
            pollTimer = undefined
          }
          setNotice((current) => current.startsWith('Realtime звонков недоступен') ? '' : current)
        } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          setNotice(failure instanceof Error ? `Realtime звонков недоступен (${failure.message}); включена резервная проверка.` : 'Realtime звонков недоступен; включена резервная проверка.')
          startPolling()
        }
      })
    return () => {
      cancelled = true
      if (pollTimer) window.clearInterval(pollTimer)
      void client.removeChannel(channel)
    }
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
    setActive(conversation); setDialog(null); setSection('chats'); setProfilePanelOpen(false); setNotice('')
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

  async function toggleMessageReaction(message: Message, emoji: string) {
    if (!client || !user) return
    const existing = messageReactions.find((reaction) => reaction.message_id === message.id && reaction.user_id === user.id && reaction.emoji === emoji)
    const result = existing
      ? await client.from('message_reactions').delete().eq('id', existing.id)
      : await client.from('message_reactions').insert({ message_id: message.id, user_id: user.id, emoji }).select('id,message_id,channel_message_id,user_id,emoji').single()
    if (result.error) {
      setError(readableError(result.error))
      return
    }
    if (existing) setMessageReactions((current) => current.filter((reaction) => reaction.id !== existing.id))
    else if (result.data) setMessageReactions((current) => [...current, result.data as MessageReaction])
  }

  async function turnServers(): Promise<RTCIceServer[]> {
    const fallback: RTCIceServer[] = [{ urls: 'stun:stun.l.google.com:19302' }]
    turnFailure.current = ''
    if (!client) {
      turnFailure.current = 'Supabase не настроен'
      return fallback
    }
    const { data, error: failure } = await client.functions.invoke('turn-credentials')
    if (failure) {
      let reason = failure.message
      const context = (failure as Error & { context?: unknown }).context
      if (context instanceof Response) {
        try {
          const body: unknown = await context.clone().json()
          if (typeof body === 'object' && body !== null && 'error' in body && typeof body.error === 'string') reason = body.error
        } catch {
          reason = `${reason} (HTTP ${context.status})`
        }
      }
      turnFailure.current = reason
      setNotice(`TURN не выдал настройки: ${reason}. Звонок попробует прямое соединение STUN.`)
      return fallback
    }
    if (!data?.iceServers?.length) {
      turnFailure.current = 'Supabase Function не вернула ICE-серверы'
      setNotice(`TURN не выдал настройки: ${turnFailure.current}. Звонок попробует прямое соединение STUN.`)
      return fallback
    }
    const servers = data.iceServers as RTCIceServer[]
    const expandTurnTransports = (url: string) => {
      if (!url.startsWith('turn:')) return [url]
      const match = /^turn:([^?]+)(?:\?(.*))?$/i.exec(url)
      if (!match) return [url]
      const authority = match[1]
      const parameters = new URLSearchParams(match[2] ?? '')
      const transport = parameters.get('transport')?.toLowerCase()
      const variants = [url]
      if (transport !== 'tcp') {
        const tcpParameters = new URLSearchParams(parameters)
        tcpParameters.set('transport', 'tcp')
        variants.push(`turn:${authority}?${tcpParameters.toString()}`)
      }
      if (/:(443|5349)$/i.test(authority) && !url.startsWith('turns:')) {
        const tlsParameters = new URLSearchParams(parameters)
        tlsParameters.set('transport', 'tcp')
        variants.push(`turns:${authority}?${tlsParameters.toString()}`)
      }
      return variants
    }
    const urls = servers.flatMap((server) => Array.isArray(server.urls) ? server.urls : [server.urls])
    const expandedUrls = urls.flatMap(expandTurnTransports)
    const hasTcpRelay = expandedUrls.some((url) => url.startsWith('turns:') || (url.startsWith('turn:') && /transport=tcp/i.test(url)))
    turnTransportWarning.current = hasTcpRelay
      ? ''
      : 'Не удалось подготовить TURN/TCP или TURN/TLS. Если сеть блокирует UDP, нужен доступный TURN endpoint с TCP/TLS (обычно порт 443).'
    const transportRank = (url: string) => {
      if (url.startsWith('turns:')) return 0
      if (url.startsWith('turn:') && /transport=tcp/i.test(url)) return 1
      if (url.startsWith('turn:')) return 2
      return 3
    }
    return servers
      .map((server) => ({
        ...server,
        urls: [...new Set((Array.isArray(server.urls) ? server.urls : [server.urls]).flatMap(expandTurnTransports))]
          .sort((a, b) => transportRank(a) - transportRank(b)),
      }))
      .sort((a, b) => {
        const firstUrl = (urls: RTCIceServer['urls']) => Array.isArray(urls) ? urls[0] ?? '' : urls
        return transportRank(firstUrl(a.urls)) - transportRank(firstUrl(b.urls))
      })
  }

  async function iceFailureDetails(peer: RTCPeerConnection, errors: Set<string>) {
    let route = 'Выбранный ICE-маршрут не определён.'
    try {
      const stats = await peer.getStats()
      const reports = [...stats.values()]
      const selectedPair = reports.find((report) => {
        if (report.type !== 'candidate-pair') return false
        const pair = report as RTCStats & { selected?: boolean; nominated?: boolean; state?: string }
        return pair.selected === true || (pair.nominated === true && pair.state === 'succeeded')
      }) as (RTCStats & { state?: string; localCandidateId?: string; remoteCandidateId?: string }) | undefined
      const candidatePair = selectedPair ?? reports.find((report) => {
        if (report.type !== 'candidate-pair') return false
        const pair = report as RTCStats & { state?: string; localCandidateId?: string; remoteCandidateId?: string }
        return pair.state === 'failed' && Boolean(pair.localCandidateId && pair.remoteCandidateId)
      }) as (RTCStats & { state?: string; localCandidateId?: string; remoteCandidateId?: string }) | undefined
      if (candidatePair) {
        const local = candidatePair.localCandidateId
          ? stats.get(candidatePair.localCandidateId) as RTCStats & { candidateType?: string; protocol?: string }
          : undefined
        const remote = candidatePair.remoteCandidateId
          ? stats.get(candidatePair.remoteCandidateId) as RTCStats & { candidateType?: string; protocol?: string }
          : undefined
        const failed = candidatePair.state === 'failed' ? 'Не прошла ICE-пара' : 'Маршрут'
        route = `${failed}: ${local?.candidateType ?? 'unknown'}/${local?.protocol ?? '?'} → ${remote?.candidateType ?? 'unknown'}/${remote?.protocol ?? '?'}.`
      } else {
        const localTypes = [...new Set(reports
          .filter((report) => report.type === 'local-candidate')
          .map((report) => {
            const candidate = report as RTCStats & { candidateType?: string; protocol?: string }
            return `${candidate.candidateType}/${candidate.protocol}`
          }))]
        route = localTypes.length
          ? `Локальные ICE-кандидаты: ${localTypes.join(', ')}.`
          : 'Браузер не собрал ICE-кандидаты.'
      }
    } catch {
      route = 'Не удалось прочитать ICE-статистику браузера.'
    }
    const serverErrors = [...errors]
    const transportWarning = turnTransportWarning.current ? ` ${turnTransportWarning.current}` : ''
    return `${route}${serverErrors.length ? ` Ошибки ICE-серверов: ${serverErrors.join('; ')}.` : ' Ошибок ICE-серверов браузер не сообщил.'}${transportWarning}`
  }

  function bindPeer(peer: RTCPeerConnection, callId: string, peerId: string) {
    const iceErrors = new Set<string>()
    let failureHandled = false
    peer.onicecandidate = (event) => {
      if (!event.candidate || !client || !user) return
      void client.from('call_signals').insert({ call_id: callId, from_uid: user.id, to_uid: peerId, kind: 'ice', payload: event.candidate.toJSON() })
        .then(({ error: failure }) => {
          if (failure && peerConnection.current === peer) setError(`Не удалось отправить сетевые данные звонка: ${readableError(failure)}`)
        })
    }
    peer.onicecandidateerror = (event) => {
      iceErrors.add(`${event.url || 'ICE server'}: ${event.errorCode}${event.errorText ? ` ${event.errorText}` : ''}`)
    }
    peer.ontrack = (event) => {
      const stream = event.streams[0]
      if (stream) {
        setRemoteMedia(stream)
        if (audioRef.current) { audioRef.current.srcObject = stream; void audioRef.current.play().catch(() => undefined) }
      }
    }
    peer.onconnectionstatechange = () => {
      if (peer.connectionState === 'connected') setCallPhase('connected')
      if (peer.connectionState === 'failed' && !failureHandled) {
        failureHandled = true
        void (async () => {
          const diagnostics = await iceFailureDetails(peer, iceErrors)
          const mediaType = peer.getSenders().some((sender) => sender.track?.kind === 'video') ? 'видеосоединение' : 'аудиосоединение'
          const detail = turnFailure.current
            ? `TURN недоступен: ${turnFailure.current}.`
            : 'TURN credentials получены, но это ещё не подтверждает доступность relay-сервера.'
          await finishCall(false)
          setNotice(`Не удалось установить ${mediaType}. ${detail} ${diagnostics}`)
        })()
      }
    }
    for (const track of localStream.current?.getTracks() ?? []) peer.addTrack(track, localStream.current!)
  }

  async function startCall(friend: Profile, withVideo = false) {
    if (!client || !user || callBusy.current) return
    callBusy.current = true; const callId = crypto.randomUUID(); callRef.current = { id: callId, peer: friend.id }; setCallMinimized(false); setCallPhase('calling'); setCallDuration(0); setError(''); setVideoCall(withVideo); setCameraEnabled(withVideo); setLocalMedia(null); setRemoteMedia(null)
    try {
      localStream.current = await navigator.mediaDevices.getUserMedia({ audio: true, video: withVideo })
      setLocalMedia(localStream.current)
      if (localVideoRef.current && withVideo) { localVideoRef.current.srcObject = localStream.current; void localVideoRef.current.play().catch(() => undefined) }
      const connection = new RTCPeerConnection({ iceServers: await turnServers() }); peerConnection.current = connection; bindPeer(connection, callId, friend.id)
      const offer = await connection.createOffer(); await connection.setLocalDescription(offer)
      const { error: failure } = await client.from('call_signals').insert({ call_id: callId, from_uid: user.id, to_uid: friend.id, kind: 'offer', payload: offer })
      if (failure) throw failure
      window.clearTimeout(callTimeout.current)
      callTimeout.current = window.setTimeout(() => { if (callRef.current?.id === callId && peerConnection.current?.connectionState !== 'connected') { void finishCall(true); setNotice('Собеседник не ответил.') } }, 45000)
    } catch (caught) { await finishCall(false); setError(caught instanceof DOMException && caught.name === 'NotAllowedError' ? withVideo ? 'Разрешите доступ к микрофону и камере в настройках браузера.' : 'Разрешите доступ к микрофону в настройках браузера.' : readableError(caught)) }
  }

  async function acceptCall() {
    if (!client || !user || !pendingOffer.current) return
    const incoming = pendingOffer.current
    const acceptVideo = Boolean(incoming.offer.sdp?.includes('m=video'))
    callRef.current = { id: incoming.callId, peer: incoming.from }; setCallMinimized(false); setCallPhase('connecting')
    try {
      setVideoCall(acceptVideo); setCameraEnabled(acceptVideo); setLocalMedia(null); setRemoteMedia(null)
      localStream.current = await navigator.mediaDevices.getUserMedia({ audio: true, video: acceptVideo })
      setLocalMedia(localStream.current)
      if (localVideoRef.current && acceptVideo) { localVideoRef.current.srcObject = localStream.current; void localVideoRef.current.play().catch(() => undefined) }
      const connection = new RTCPeerConnection({ iceServers: await turnServers() }); peerConnection.current = connection; bindPeer(connection, incoming.callId, incoming.from)
      await connection.setRemoteDescription(incoming.offer)
      for (const candidate of pendingCandidates.current.splice(0)) await connection.addIceCandidate(candidate)
      const answer = await connection.createAnswer(); await connection.setLocalDescription(answer)
      const { error: failure } = await client.from('call_signals').insert({ call_id: incoming.callId, from_uid: user.id, to_uid: incoming.from, kind: 'answer', payload: answer })
      if (failure) throw failure
      pendingOffer.current = null
    } catch (caught) {
      await client.from('call_signals').insert({ call_id: incoming.callId, from_uid: user.id, to_uid: incoming.from, kind: 'reject', payload: null }); await finishCall(false)
      setError(caught instanceof DOMException && caught.name === 'NotAllowedError' ? acceptVideo ? 'Разрешите доступ к микрофону и камере, чтобы принять видеозвонок.' : 'Разрешите доступ к микрофону, чтобы принять звонок.' : readableError(caught))
    }
  }

  async function finishCall(notify = true) {
    const current = callRef.current ?? pendingOffer.current
    window.clearTimeout(callTimeout.current)
    const callId = current && ('peer' in current ? current.id : current.callId)
    if (notify && current && callId && client && user) await client.from('call_signals').insert({ call_id: callId, from_uid: user.id, to_uid: 'peer' in current ? current.peer : current.from, kind: 'hangup', payload: null })
    peerConnection.current?.close(); peerConnection.current = null; localStream.current?.getTracks().forEach((track) => track.stop()); localStream.current = null
    if (audioRef.current) audioRef.current.srcObject = null
    if (localVideoRef.current) localVideoRef.current.srcObject = null
    if (remoteVideoRef.current) remoteVideoRef.current.srcObject = null
    callRef.current = null; pendingOffer.current = null; pendingCandidates.current = []; callBusy.current = false; setCallMinimized(false); setCallPhase('idle'); setMuted(false); setCallDuration(0); setVideoCall(false); setCameraEnabled(true); setLocalMedia(null); setRemoteMedia(null)
  }

  function toggleCamera() {
    const track = localStream.current?.getVideoTracks()[0]
    if (!track) return
    const next = !cameraEnabled
    track.enabled = next
    setCameraEnabled(next)
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
    if (!client || !user || !profile || profileSaving) return
    const formData = new FormData(event.currentTarget as HTMLFormElement)
    const name = formData.get('display_name')?.toString().trim()
    if (!name || name.length > 40) { setError('Имя должно содержать от 1 до 40 символов.'); return }
    try {
      setProfileSaving(true)
      const username = usernameSchema.parse(formData.get('username')?.toString() ?? '')
      const { error: failure } = await client.from('profiles').update({ display_name: name, username }).eq('id', user.id)
      if (failure?.code === '23505') throw new Error('Этот юзернейм уже занят.')
      if (failure) throw failure
      setProfile({ ...profile, display_name: name, username }); setProfileDraft({ displayName: name, username }); setNotice('Профиль сохранён.')
    } catch (caught) { setError(readableError(caught)) }
    finally { setProfileSaving(false) }
  }

  async function copyId() { if (profile) { await navigator.clipboard.writeText(`#${profile.user_number}`); setNotice('ID скопирован.') } }
  async function copyUsername() { if (profile) { await navigator.clipboard.writeText(`@${profile.username}`); setNotice('Юзернейм скопирован.') } }
  function composerKey(event: KeyboardEvent<HTMLTextAreaElement>) { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); void sendMessage() } }

  if (authLoading) return <div className="loading-screen"><span className="brand-mark"><MessageCircle size={17} /></span><LoaderCircle className="spin" size={19} /></div>
  if (!isSupabaseConfigured) return <SetupScreen />
  if (!session) return <AuthScreen />
  const query = search.toLowerCase()
  const visibleChats = conversations.filter((row) => row.peer.display_name.toLowerCase().includes(query) || row.peer.username.includes(query.replace(/^@/, '')) || row.peer.aliases?.some((alias) => alias.includes(query.replace(/^@/, ''))) || `#${row.peer.user_number}`.includes(query.replace(/^#/, '')))
  const visibleFriends = friends.filter((friend) => friend.display_name.toLowerCase().includes(query) || friend.username.includes(query.replace(/^@/, '')) || friend.aliases?.some((alias) => alias.includes(query.replace(/^@/, ''))) || `#${friend.user_number}`.includes(query.replace(/^#/, '')))
  const peer = active?.peer
  const callPeerId = callRef.current?.peer ?? pendingOffer.current?.from
  const callPeer = friends.find((friend) => friend.id === callPeerId)
  const setChatCategory = (category: ChatFilter) => {
    setChatFilter(category)
    if (category === 'groups' || category === 'channels') {
      setSection('channels')
      setProfilePanelOpen(false)
    } else {
      setSection('chats')
    }
  }

  return <main className={`messenger-shell${profilePanelOpen && section === 'chats' ? ' has-profile-panel' : ''}`}><aside className="sidebar">
    <div className="sidebar-top"><div className="brand"><span className="brand-mark"><MessageCircle size={17} strokeWidth={2.4} /></span><span>milly</span><span className="brand-dot">.</span></div><div className="sidebar-top-actions"><button className="icon-button" title="Найти сообщения" aria-label="Найти сообщения" onClick={() => document.querySelector<HTMLInputElement>('.search-box input')?.focus()}><Search size={15} /></button><button className="icon-button" title="Добавить друга" aria-label="Добавить друга" onClick={() => setDialog('friends')}><Plus size={16} /></button><span className="network-status" title={connected ? 'Подключено' : 'Нет подключения'}>{connected ? <Wifi size={14} /> : <WifiOff size={14} />}</span></div></div>
    <label className="search-box"><Search size={15} /><input placeholder="Поиск чатов и людей…" value={search} onChange={(event) => setSearch(event.target.value)} /><button type="button" className="search-clear" aria-label="Очистить поиск" onClick={() => setSearch('')}><X size={13} /></button></label>
    <nav className="chat-category-tabs" aria-label="Фильтр переписок">
      <button className={section === 'chats' && chatFilter === 'all' ? 'selected' : ''} onClick={() => setChatCategory('all')}>Все</button>
      <button className={section === 'chats' && chatFilter === 'direct' ? 'selected' : ''} onClick={() => setChatCategory('direct')}>Личные</button>
      <button className={section === 'channels' && chatFilter === 'groups' ? 'selected' : ''} onClick={() => setChatCategory('groups')}>Группы</button>
      <button className={section === 'channels' && chatFilter === 'channels' ? 'selected' : ''} onClick={() => setChatCategory('channels')}>Каналы</button>
    </nav>
    <div className="sidebar-section-heading"><span>{section === 'friends' ? 'КОНТАКТЫ' : section === 'channels' ? 'ПРОСТРАНСТВА И КАНАЛЫ' : 'СООБЩЕНИЯ'}</span><button className="icon-button" title="Добавить друга" aria-label="Добавить друга" onClick={() => setDialog('friends')}><Plus size={16} /></button></div>
    <nav className="section-tabs" aria-label="Разделы"><button className={section === 'chats' ? 'selected' : ''} onClick={() => { setSection('chats'); setChatFilter('all') }}><MessageCircle size={15} /> Личные <span>{conversations.length || ''}</span></button><button className={section === 'friends' ? 'selected' : ''} onClick={() => setSection('friends')}><Users size={15} /> Друзья <span>{friends.length || ''}</span></button><button className={section === 'channels' ? 'selected' : ''} onClick={() => { setSection('channels'); setChatFilter('channels') }}><Hash size={15} /> Каналы</button>{profile?.id === ADMIN_USER_ID && <button className={section === 'admin' ? 'selected' : ''} onClick={() => setSection('admin')}><ShieldCheck size={15} /> Управление</button>}</nav>
    {section === 'chats' ? <div className="contact-list">{visibleChats.length ? visibleChats.map((chat) => <button className={`contact-row${active?.id === chat.id ? ' active' : ''}`} key={chat.id} onClick={() => { setActive(chat); setSection('chats'); setError('') }}><Avatar name={chat.peer.display_name} online={online.has(chat.peer.id)} image={chat.peer.avatar_url} /><span className="contact-copy"><span className="contact-name">{chat.peer.display_name}{chat.peer.is_verified && <ShieldCheck className="verified-mark" size={13} />}</span><span className="contact-preview">{chat.lastMessage?.image_path ? 'Фотография' : chat.lastMessage?.body || 'Начните разговор'}</span></span>{chat.lastMessage && <span className="contact-time">{displayDate(chat.lastMessage.created_at)}</span>}</button>) : <EmptyList icon={<MessageCircle size={17} />} title="Разговоров пока нет" action="Найти друга" onClick={() => setDialog('friends')} />}</div> : section === 'friends' ? <div className="contact-list">{requests.length > 0 && <div className="request-group"><span className="request-label">ЗАПРОСЫ · {requests.length}</span>{requests.map((request) => <RequestRow key={request.id} request={request} onHandle={handleRequest} />)}</div>}{visibleFriends.map((friend) => <button className="contact-row" key={friend.id} onClick={() => void openChat(friend)}><Avatar name={friend.display_name} online={online.has(friend.id)} image={friend.avatar_url} /><span className="contact-copy"><span className="contact-name">{friend.display_name}{friend.is_verified && <ShieldCheck className="verified-mark" size={13} />}</span><span className="contact-preview">{online.has(friend.id) ? 'В сети' : `#${friend.user_number} · @${friend.username}`}</span></span></button>)}{!visibleFriends.length && !requests.length && <EmptyList icon={<Users size={17} />} title="Здесь будут ваши друзья" action="Добавить друга" onClick={() => setDialog('friends')} />}</div> : <div className="contact-list sidebar-channel-hint"><Hash size={20} /><strong>Пространства и каналы</strong><span>Выберите канал в рабочей области.</span></div>}
    <div className="sidebar-bottom">{installPrompt && <button className="install-button" onClick={() => void installPrompt.prompt?.()}>Установить Milly</button>}<div className="account-menu-anchor" ref={accountMenuRef}><button className={`profile-control${accountMenuOpen ? ' menu-open' : ''}`} aria-expanded={accountMenuOpen} onClick={() => setAccountMenuOpen((open) => !open)}><Avatar name={profile?.display_name ?? 'M'} image={ownAvatar} /><span className="contact-copy"><span className="contact-name">{profile?.display_name ?? 'Профиль'}{profile?.is_verified && <ShieldCheck className="verified-mark" size={13} />}</span><span className="contact-preview">{profile ? `@${profile.username}` : 'Настроить профиль'}</span></span><MoreHorizontal size={17} /></button>{accountMenuOpen && <div className="account-menu" role="menu"><div className="account-menu-heading"><Avatar name={profile?.display_name ?? 'M'} image={ownAvatar} /><span><strong>{profile?.display_name ?? 'Аккаунт'}</strong><small>@{profile?.username ?? '—'}</small></span></div><button role="menuitem" onClick={() => { setAccountMenuOpen(false); if (profile) setProfileDraft({ displayName: profile.display_name, username: profile.username }); setDialog('profile') }}><Settings2 size={16} /> Профиль и настройки</button><button role="menuitem" onClick={() => { setAccountMenuOpen(false); setSection('friends') }}><Users size={16} /> Контакты</button><button role="menuitem" onClick={() => { setAccountMenuOpen(false); setSection('channels'); setChatFilter('channels') }}><Hash size={16} /> Пространства и каналы</button><button role="menuitem" onClick={() => { setAccountMenuOpen(false); setAppearanceOpen(true) }}><SlidersHorizontal size={16} /> Оформление</button>{profile?.id === ADMIN_USER_ID && <button role="menuitem" onClick={() => { setAccountMenuOpen(false); setSection('admin') }}><ShieldCheck size={16} /> Администрирование</button>}<button className="account-menu-signout" role="menuitem" onClick={() => { setAccountMenuOpen(false); void finishCall(false); void client?.auth.signOut() }}><LogOut size={16} /> Выйти из аккаунта</button></div>}</div></div>
  </aside>

  <section className="chat-pane">{section === 'admin' && client ? <Suspense fallback={<div className="channel-loading app-loading"><LoaderCircle className="spin" size={19} /> Открываем панель…</div>}><AdminWorkspace client={client} /> </Suspense> : section === 'channels' && client && user && profile ? <Suspense fallback={<div className="channel-loading app-loading"><LoaderCircle className="spin" size={19} /> Открываем каналы…</div>}><ChannelsWorkspace client={client} user={user} profile={{ ...profile, avatar_url: ownAvatar }} friends={friends} onBack={() => setSection('chats')} /></Suspense> : active && peer ? <>
    <header className="chat-header"><button className="icon-button mobile-back" aria-label="Назад" onClick={() => setActive(null)}><ArrowLeft size={18} /></button><button className="chat-avatar-button" aria-label="Открыть профиль" onClick={() => { setProfileToView(peer); setProfilePanelOpen(true) }}><Avatar name={peer.display_name} online={online.has(peer.id)} large image={peer.avatar_url} /></button><button className="chat-person chat-person-button" onClick={() => { setProfileToView(peer); setProfilePanelOpen((open) => !open) }}><strong>{peer.display_name}{peer.is_verified && <ShieldCheck className="verified-mark" size={14} />}</strong><span>{online.has(peer.id) ? 'В сети' : 'Не в сети'}</span></button><div className="header-actions"><button className="icon-button call-button" title="Голосовой звонок" aria-label="Голосовой звонок" onClick={() => void startCall(peer)}><Phone size={18} /></button><button className="icon-button video-call-button" title="Видеозвонок" aria-label="Видеозвонок" onClick={() => void startCall(peer, true)}><Video size={18} /></button><button className="icon-button" title="Удалить из друзей" aria-label="Удалить из друзей" onClick={() => setFriendToRemove(peer)}><MoreHorizontal size={19} /></button></div></header>
    <div className="messages-scroll" ref={scrollRef}>{loadingMessages && <div className="history-loading"><LoaderCircle className="spin" size={16} /> Загружаем разговор</div>}{hasOlder && !loadingMessages && <button className="older-button" onClick={() => void loadOlder()}>Показать предыдущие сообщения</button>}{messages.length === 0 && !loadingMessages ? <div className="chat-begin"><div className="begin-icon"><MessageCircle size={24} /></div><span>СЕЙЧАС ВЫ ЗДЕСЬ</span><h2>Начало хорошего<br />разговора.</h2><p>Напишите {peer.display_name}, и это место станет вашим.</p></div> : <div className="message-list">{messages.map((message, index) => {
      const mine = message.sender_id === user?.id; const previous = messages[index - 1]
      const groupStart = !previous || previous.sender_id !== message.sender_id || new Date(message.created_at).getTime() - new Date(previous.created_at).getTime() > 300000
      const newDay = !previous || new Date(message.created_at).toDateString() !== new Date(previous.created_at).toDateString()
      const groupedReactions = reactionChoices.filter((emoji) => messageReactions.some((reaction) => reaction.message_id === message.id && reaction.emoji === emoji)).map((emoji) => {
        const matching = messageReactions.filter((reaction) => reaction.message_id === message.id && reaction.emoji === emoji)
        return { emoji, count: matching.length, active: matching.some((reaction) => reaction.user_id === user?.id) }
      })
      return <Fragment key={message.id}>{newDay && <div className="message-day-divider"><span>{dayLabel(message.created_at)}</span></div>}<div className={`message-row${mine ? ' mine' : ''}${groupStart ? ' group-start' : ''}`}>{!mine && groupStart && <Avatar name={peer.display_name} />}{!mine && !groupStart && <span className="avatar-spacer" />}<div className="message-content">{message.image_url && <button className="message-image" title="Открыть фотографию" onClick={() => window.open(message.image_url, '_blank', 'noopener,noreferrer')}><img src={message.image_url} alt="Фотография в сообщении" loading="lazy" /></button>}{message.body && <div className="message-bubble">{message.body}</div>}<span className="message-meta">{clock(message.created_at)}{mine && <CheckCheck size={13} />}</span><div className="message-reactions">{groupedReactions.map((reaction) => <button key={reaction.emoji} className={`reaction-chip${reaction.active ? ' active' : ''}`} aria-label={`${reaction.emoji} ${reaction.count}`} onClick={() => void toggleMessageReaction(message, reaction.emoji)}>{reaction.emoji}<span>{reaction.count}</span></button>)}<div className="reaction-picker">{reactionChoices.map((emoji) => <button key={emoji} title={`Поставить реакцию ${emoji}`} aria-label={`Поставить реакцию ${emoji}`} onClick={() => void toggleMessageReaction(message, emoji)}>{emoji}</button>)}</div></div></div></div></Fragment>
    })}</div>}</div>
    <form className="composer" onSubmit={(event) => void sendMessage(event)}><input ref={fileRef} type="file" accept="image/*" hidden onChange={(event) => { const file = event.target.files?.[0]; if (file) void sendMessage(undefined, file); event.target.value = '' }} /><button type="button" className="icon-button attach-button" title="Прикрепить фотографию" aria-label="Прикрепить фотографию" onClick={() => fileRef.current?.click()}><ImagePlus size={19} /></button><textarea ref={composerRef} value={text} onChange={(event) => { const textarea = event.currentTarget; setText(textarea.value); textarea.style.height = 'auto'; textarea.style.height = `${Math.min(textarea.scrollHeight, 160)}px` }} onKeyDown={composerKey} placeholder="Напишите сообщение…" rows={1} maxLength={4000} aria-label="Текст сообщения" /><button type="submit" className="send-button" disabled={sending || !text.trim()} aria-label="Отправить сообщение">{sending ? <LoaderCircle className="spin" size={17} /> : <Send size={17} />}</button></form>
  </> : <div className="welcome-pane"><span className="welcome-overline">ТИШЕ. БЛИЖЕ. ПРОЩЕ.</span><div className="welcome-orbit"><span className="orbit-small orbit-one" /><span className="orbit-small orbit-two" /><span className="welcome-mark"><MessageCircle size={27} strokeWidth={1.7} /></span></div><h1>Хорошие разговоры<br />начинаются <em>здесь.</em></h1><p>Выберите друга и напишите ему. Остальное подождёт.</p><button className="primary-button welcome-button" onClick={() => setDialog('friends')}><Users size={16} /> Добавить друга</button><div className="welcome-foot"><span />{friends.length ? `${friends.length} ${friends.length === 1 ? 'друг' : 'друзей'} рядом` : 'Ваш круг только начинается'}<span /></div></div>}</section>

  {profilePanelOpen && profileToView && section === 'chats' && <aside className="profile-sidebar" aria-label="Профиль пользователя"><header className="profile-sidebar-header"><button className="icon-button profile-sidebar-back" onClick={() => setProfilePanelOpen(false)} aria-label="Закрыть профиль"><ArrowLeft size={17} /></button><strong>Профиль</strong><button className="icon-button" onClick={() => setProfilePanelOpen(false)} aria-label="Закрыть профиль"><X size={17} /></button></header><div className="profile-sidebar-content"><div className="profile-sidebar-hero"><Avatar name={profileToView.display_name} large image={profileToView.avatar_url} /><strong>{profileToView.display_name}{profileToView.is_verified && <ShieldCheck className="verified-mark" size={17} />}</strong><span>@{profileToView.username}</span><small className={online.has(profileToView.id) ? 'profile-status online' : 'profile-status'}><i />{online.has(profileToView.id) ? 'В сети' : 'Не в сети'}</small></div><div className="profile-info-list"><div><span className="profile-info-icon"><BadgeCheck size={15} /></span><span><small>Username</small><strong>@{profileToView.username}</strong></span></div><div><span className="profile-info-icon"><Hash size={15} /></span><span><small>ID аккаунта</small><strong>#{profileToView.user_number}</strong></span></div><div><span className="profile-info-icon"><CalendarDays size={15} /></span><span><small>Дата регистрации</small><strong>{profileDate(profileToView.registration_date_override ?? profileToView.created_at ?? '')}</strong></span></div><div><span className="profile-info-icon"><ShieldCheck size={15} /></span><span><small>Верификация</small><strong>{profileToView.is_verified ? 'Подтверждён' : 'Не подтверждён'}</strong></span></div>{Boolean(profileToView.aliases?.length) && <div><span className="profile-info-icon"><AtSign size={15} /></span><span><small>Дополнительные username</small><strong>{profileToView.aliases?.map((alias) => `@${alias}`).join(', ')}</strong></span></div>}</div><div className="profile-sidebar-actions"><button className="primary-button" onClick={() => setProfilePanelOpen(false)}><MessageCircle size={15} /> Написать сообщение</button><button className="secondary-button danger-button" onClick={() => { setProfilePanelOpen(false); setFriendToRemove(profileToView) }}><Users size={15} /> Удалить из контактов</button></div></div></aside>}
  {error && <Toast message={error} error onClose={() => setError('')} />}{notice && <Toast message={notice} onClose={() => setNotice('')} />}
  {dialog === 'friends' && <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setDialog(null) }}><section className="modal" role="dialog" aria-modal="true" aria-labelledby="friend-title"><div className="modal-heading"><div><span className="form-kicker">ПОПОЛНИТЬ СВОЙ КРУГ</span><h2 id="friend-title">Найти друга</h2></div><button className="icon-button" aria-label="Закрыть" onClick={() => setDialog(null)}><X size={18} /></button></div><p>Ищите по статическому ID или началу юзернейма. Начните вводить — подходящие аккаунты появятся сразу.</p><form className="add-friend-form" onSubmit={(event) => { event.preventDefault(); if (friendMatches.length === 1) void addFriend(friendMatches[0]); else setNotice('Выберите пользователя из списка.') }}><label htmlFor="friend-id">@USERNAME ИЛИ #ID</label><div><input id="friend-id" value={friendId} onChange={(event) => { setFriendId(event.target.value); setError(''); setNotice('') }} placeholder="Введите @username" autoFocus autoComplete="off" required /><button className="primary-button" disabled={friendBusy || friendMatches.length !== 1}>{friendBusy ? <LoaderCircle className="spin" size={16} /> : <Plus size={16} />} Отправить запрос</button></div></form>{friendSearching ? <p className="friend-search-empty">Ищем пользователей…</p> : friendMatches.length > 0 ? <div className="friend-suggestions" role="listbox" aria-label="Результаты поиска">{friendMatches.map((candidate) => <button key={candidate.id} type="button" className="friend-suggestion" role="option" aria-selected="false" disabled={friendBusy} onClick={() => void addFriend(candidate)}><Avatar name={candidate.display_name} image={candidate.avatar_url} /><span className="friend-suggestion-copy"><strong>{candidate.display_name}{candidate.is_verified && <ShieldCheck className="verified-mark" size={13} />}</strong><span>#{candidate.user_number} · @{candidate.username}{candidate.aliases?.length ? ` · ещё ${candidate.aliases.map((alias) => `@${alias}`).join(', ')}` : ''}</span></span><Plus size={16} /></button>)}</div> : friendId.trim().length >= 2 && <p className="friend-search-empty">Подходящих пользователей не найдено.</p>}<div className="profile-identifiers"><div className="my-id"><span>ВАШ ID</span><strong>#{profile?.user_number}</strong><button className="icon-button" title="Скопировать ID" aria-label="Скопировать ID" onClick={() => void copyId()}><Copy size={16} /></button></div><div className="my-id"><span>ЮЗЕРНЕЙМ</span><strong>@{profile?.username}</strong><button className="icon-button" title="Скопировать юзернейм" aria-label="Скопировать юзернейм" onClick={() => void copyUsername()}><Copy size={16} /></button></div></div>{requests.length > 0 && <div className="modal-requests"><span className="request-label">ВХОДЯЩИЕ ЗАПРОСЫ</span>{requests.map((request) => <RequestRow key={request.id} request={request} onHandle={handleRequest} />)}</div>}</section></div>}
  {dialog === 'peer' && profileToView && <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setDialog(null) }}><section className="modal peer-profile-modal" role="dialog" aria-modal="true" aria-labelledby="peer-profile-title"><div className="modal-heading"><span className="form-kicker">ПРОФИЛЬ ДРУГА</span><button className="icon-button" aria-label="Закрыть" onClick={() => setDialog(null)}><X size={18} /></button></div><div className="profile-cover peer-profile-cover"><span className="profile-cover-orbit" /><Avatar name={profileToView.display_name} large image={profileToView.avatar_url} /></div><div className="profile-identity"><strong id="peer-profile-title">{profileToView.display_name}{profileToView.is_verified && <ShieldCheck className="verified-mark" size={17} />}</strong><span>@{profileToView.username}</span>{Boolean(profileToView.aliases?.length) && <small className="profile-aliases">Также: {profileToView.aliases?.map((alias) => `@${alias}`).join(', ')}</small>}{profileToView.registration_date_override && <small className="profile-date">В Milly с {profileDate(profileToView.registration_date_override)}</small>}<small className={online.has(profileToView.id) ? 'peer-online' : ''}><i />{online.has(profileToView.id) ? 'В сети' : 'Участник Milly'}</small></div><div className="profile-identifiers"><div className="my-id"><span>СТАТИЧЕСКИЙ ID</span><strong>#{profileToView.user_number}</strong><button className="icon-button" title="Скопировать ID" aria-label="Скопировать ID" onClick={() => { void navigator.clipboard.writeText(`#${profileToView.user_number}`); setNotice('ID скопирован.') }}><Copy size={16} /></button></div><div className="my-id"><span>ЮЗЕРНЕЙМ</span><strong>@{profileToView.username}</strong><button className="icon-button" title="Скопировать юзернейм" aria-label="Скопировать юзернейм" onClick={() => { void navigator.clipboard.writeText(`@${profileToView.username}`); setNotice('Юзернейм скопирован.') }}><Copy size={16} /></button></div></div><div className="peer-profile-actions"><button className="primary-button" onClick={() => { setDialog(null); void startCall(profileToView) }}><Phone size={16} /> Позвонить</button><button className="secondary-button" onClick={() => { void openChat(profileToView) }}><MessageCircle size={16} /> Открыть чат</button><button className="secondary-button danger-button" onClick={() => { setDialog(null); setFriendToRemove(profileToView) }}>Удалить из друзей</button></div></section></div>}
  {dialog === 'profile' && profile && <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setDialog(null) }}><section className="modal profile-modal" role="dialog" aria-modal="true" aria-labelledby="profile-title"><div className="modal-heading"><div><span className="form-kicker">ВАШЕ ПРОСТРАНСТВО</span><h2 id="profile-title">Профиль</h2></div><button className="icon-button" aria-label="Закрыть" onClick={() => setDialog(null)}><X size={18} /></button></div><div className="profile-cover"><span className="profile-cover-orbit" /><button className="photo-button profile-photo-button" title="Изменить фотографию" onClick={() => avatarRef.current?.click()}><Avatar name={profile.display_name} large image={ownAvatar} /><span><ImagePlus size={14} /></span></button><input ref={avatarRef} type="file" accept="image/*" hidden onChange={(event) => { void uploadAvatar(event.target.files?.[0]); event.target.value = '' }} /></div><div className="profile-identity"><strong>{profile.display_name}{profile.is_verified && <ShieldCheck className="verified-mark" size={17} />}</strong><span>@{profile.username}</span>{Boolean(profile.aliases?.length) && <small className="profile-aliases">Также: {profile.aliases?.map((alias) => `@${alias}`).join(', ')}</small>}{profile.registration_date_override && <small className="profile-date">В Milly с {profileDate(profile.registration_date_override)}</small>}<small><i /> Аккаунт Milly</small></div><div className="profile-identifiers"><div className="my-id"><span>СТАТИЧЕСКИЙ ID</span><strong>#{profile.user_number}</strong><button className="icon-button" title="Скопировать ID" aria-label="Скопировать ID" onClick={() => void copyId()}><Copy size={16} /></button></div><div className="my-id"><span>ЮЗЕРНЕЙМ</span><strong>@{profile.username}</strong><button className="icon-button" title="Скопировать юзернейм" aria-label="Скопировать юзернейм" onClick={() => void copyUsername()}><Copy size={16} /></button></div></div><form className="profile-edit" onSubmit={(event) => void saveName(event)}><div className="profile-section-title">Редактор профиля</div><div className="profile-editor-preview"><Avatar name={profileDraft.displayName || profile.display_name} image={ownAvatar} /><span><strong>{profileDraft.displayName || profile.display_name}</strong><small>@{profileDraft.username || profile.username}</small></span></div><label>Имя<input name="display_name" value={profileDraft.displayName} onChange={(event) => setProfileDraft((draft) => ({ ...draft, displayName: event.target.value }))} maxLength={40} required /></label><label>Username<input name="username" value={profileDraft.username} onChange={(event) => setProfileDraft((draft) => ({ ...draft, username: event.target.value }))} minLength={3} maxLength={24} pattern="[a-zA-Z0-9_]+" autoCapitalize="off" autoComplete="off" spellCheck={false} required /></label><div className="profile-editor-actions"><button className="primary-button" disabled={profileSaving}>{profileSaving ? <LoaderCircle className="spin" size={15} /> : null}Сохранить</button><button type="button" className="secondary-button" disabled={profileSaving} onClick={() => { setProfileDraft({ displayName: profile.display_name, username: profile.username }); setDialog(null) }}>Отменить</button></div></form><button className="signout-button" onClick={() => { void finishCall(false); void client?.auth.signOut(); setDialog(null) }}><LogOut size={16} /> Выйти из аккаунта</button></section></div>}
  {friendToRemove && <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget && !friendBusy) setFriendToRemove(null) }}><section className="modal" role="alertdialog" aria-modal="true" aria-labelledby="remove-friend-title"><div className="modal-heading"><div><span className="form-kicker">ПОДТВЕРЖДЕНИЕ</span><h2 id="remove-friend-title">Удалить из друзей?</h2></div><button className="icon-button" aria-label="Закрыть" disabled={friendBusy} onClick={() => setFriendToRemove(null)}><X size={18} /></button></div><p>{friendToRemove.display_name} исчезнет из списка друзей. История переписки останется.</p><div className="confirm-actions"><button type="button" className="secondary-button" disabled={friendBusy} onClick={() => setFriendToRemove(null)}>Отмена</button><button type="button" className="primary-button danger-button" disabled={friendBusy} onClick={() => void removeFriend(friendToRemove)}>{friendBusy ? <LoaderCircle className="spin" size={16} /> : null}Удалить из друзей</button></div></section></div>}
  {appearanceOpen && <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setAppearanceOpen(false) }}><section className="modal appearance-modal" role="dialog" aria-modal="true" aria-labelledby="appearance-title"><div className="modal-heading"><div><span className="form-kicker">НАСТРОЙКИ</span><h2 id="appearance-title">Оформление</h2></div><button className="icon-button" aria-label="Закрыть" onClick={() => setAppearanceOpen(false)}><X size={18} /></button></div><p>Выберите тему для Milly. Настройка сохраняется на этом устройстве.</p><button className={`theme-option${lightTheme ? ' selected' : ''}`} onClick={() => setLightTheme(true)}><span className="theme-preview theme-preview-light" /><span><strong>Светло-голубая</strong><small>Светлый фон и голубые акценты</small></span><span className="theme-radio" /></button><button className={`theme-option${!lightTheme ? ' selected' : ''}`} onClick={() => setLightTheme(false)}><span className="theme-preview theme-preview-dark" /><span><strong>Тёмная</strong><small>Спокойные тёмные поверхности</small></span><span className="theme-radio" /></button></section></div>}
  {callPhase !== 'idle' && <CallWindow phase={callPhase} minimized={callMinimized} peerName={callPeer?.display_name ?? (callPhase === 'incoming' ? incomingFrom : 'Друг')} peerAvatar={callPeer?.avatar_url} duration={callDuration} muted={muted} remoteVolume={remoteVolume} onRemoteVolumeChange={setRemoteVolume} videoCall={videoCall} cameraEnabled={cameraEnabled} localMedia={localMedia} remoteMedia={remoteMedia} onAccept={() => void acceptCall()} onMute={() => { const next = !muted; setMuted(next); localStream.current?.getAudioTracks().forEach((track) => { track.enabled = !next }) }} onCamera={toggleCamera} onMinimize={() => setCallMinimized(true)} onRestore={() => setCallMinimized(false)} onEnd={() => callPhase === 'incoming' ? void rejectIncomingCall() : void finishCall()} />}
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

function CallWindow({ phase, minimized, peerName, peerAvatar, duration, muted, remoteVolume, onRemoteVolumeChange, videoCall, cameraEnabled, localMedia, remoteMedia, onAccept, onMute, onCamera, onMinimize, onRestore, onEnd }: { phase: CallPhase; minimized: boolean; peerName: string; peerAvatar?: string; duration: number; muted: boolean; remoteVolume: number; onRemoteVolumeChange: (volume: number) => void; videoCall: boolean; cameraEnabled: boolean; localMedia: MediaStream | null; remoteMedia: MediaStream | null; onAccept: () => void; onMute: () => void; onCamera: () => void; onMinimize: () => void; onRestore: () => void; onEnd: () => void }) {
  const localVideo = useRef<HTMLVideoElement>(null)
  const remoteVideo = useRef<HTMLVideoElement>(null)
  useEffect(() => {
    if (localVideo.current) localVideo.current.srcObject = localMedia
    if (remoteVideo.current) remoteVideo.current.srcObject = remoteMedia
  }, [localMedia, remoteMedia, videoCall, cameraEnabled])
  const label = phase === 'incoming' ? 'ВХОДЯЩИЙ ЗВОНОК' : phase === 'calling' ? 'ВЫЗЫВАЕМ' : phase === 'connecting' ? 'СОЕДИНЕНИЕ' : 'РАЗГОВОР'
  if (minimized) return <div className="call-mini" role="region" aria-label="Свернутый звонок">
    <button className="call-mini-identity" onClick={onRestore} title="Развернуть звонок">
      <Avatar name={peerName} image={peerAvatar} />
      <span><strong>{peerName}</strong><small>{phase === 'connected' ? `${String(Math.floor(duration / 60)).padStart(2, '0')}:${String(duration % 60).padStart(2, '0')}` : label}</small></span>
    </button>
    <button className={`call-mini-control${muted ? ' muted' : ''}`} onClick={onMute} aria-label={muted ? 'Включить микрофон' : 'Выключить микрофон'} title={muted ? 'Включить микрофон' : 'Выключить микрофон'}>{muted ? <MicOff size={17} /> : <Mic size={17} />}</button>
    <button className="call-mini-control" onClick={onRestore} aria-label="Развернуть звонок" title="Развернуть звонок"><Maximize2 size={17} /></button>
    <button className="call-mini-control call-mini-end" onClick={onEnd} aria-label="Завершить звонок" title="Завершить звонок"><Phone size={17} /></button>
  </div>
  return <div className="call-overlay"><div className={`call-card${videoCall ? ' video-call-card' : ''}`}>{phase !== 'incoming' && <button className="call-minimize" aria-label="Свернуть звонок" title="Свернуть звонок" onClick={onMinimize}><Minimize2 size={17} /></button>}<button className="call-close" aria-label="Завершить звонок" onClick={onEnd}><X size={17} /></button>{videoCall ? <div className="call-video-stage"><div className="remote-video-frame">{remoteMedia ? <video ref={remoteVideo} autoPlay playsInline muted /> : <Avatar name={peerName} large image={peerAvatar} />}</div><div className="local-video-frame">{cameraEnabled && localMedia ? <video ref={localVideo} autoPlay playsInline muted /> : <span>Камера выключена</span>}</div></div> : <Avatar name={peerName} large image={peerAvatar} />}<span className="call-state">{videoCall ? `${label} · ВИДЕО` : label}</span><h2>{peerName}</h2><p>{phase === 'connected' ? `${String(Math.floor(duration / 60)).padStart(2, '0')}:${String(duration % 60).padStart(2, '0')}` : phase === 'incoming' ? 'Хочет поговорить с вами' : videoCall ? 'Видеозвонок Milly' : 'Голосовой звонок Milly'}</p>{(phase === 'connected' || phase === 'connecting') && <label className="call-volume" title="Громкость собеседника"><span>{remoteVolume === 0 ? <VolumeX size={17} /> : <Volume2 size={17} />}</span><input aria-label="Громкость собеседника" type="range" min="0" max="1" step="0.01" value={remoteVolume} onChange={(event) => onRemoteVolumeChange(Number(event.target.value))} /><output>{Math.round(remoteVolume * 100)}%</output></label>}<div className="call-actions">{phase === 'incoming' && <button className="accept-call" aria-label="Принять звонок" onClick={onAccept}><Phone size={20} /></button>}{(phase === 'connected' || phase === 'connecting') && <><button className={`mute-call${muted ? ' muted' : ''}`} aria-label={muted ? 'Включить микрофон' : 'Выключить микрофон'} aria-pressed={muted} title={muted ? 'Включить микрофон' : 'Выключить микрофон'} onClick={onMute}>{muted ? <MicOff size={19} /> : <Mic size={19} />}</button>{videoCall && <button className={`camera-call${cameraEnabled ? '' : ' muted'}`} aria-label={cameraEnabled ? 'Выключить камеру' : 'Включить камеру'} onClick={onCamera}>{cameraEnabled ? <Video size={18} /> : <VideoOff size={18} />}</button>}</>}<button className="end-call" aria-label={phase === 'incoming' ? 'Отклонить звонок' : 'Завершить звонок'} onClick={onEnd}><Phone size={20} /></button></div><span className="call-encryption-note"><ShieldCheck size={13} /> Прямой WebRTC-звонок · не E2EE</span></div></div>
}