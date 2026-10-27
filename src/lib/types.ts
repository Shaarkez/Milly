export type Profile = {
  id: string
  milly_id: string
  user_number: number
  username: string
  display_name: string
  avatar_path: string | null
  avatar_url?: string
  is_verified?: boolean
  registration_date_override?: string | null
  aliases?: string[]
}

export type Message = {
  id: string
  conversation_id: string
  sender_id: string
  body: string | null
  image_path: string | null
  created_at: string
  image_url?: string
}

export type MessageReaction = {
  id: number
  message_id: string | null
  channel_message_id: string | null
  user_id: string
  emoji: string
}

export type Conversation = {
  id: string
  user_low: string
  user_high: string
  updated_at: string
  peer: Profile
  lastMessage?: Message
}

export type FriendRequest = {
  id: string
  sender_id: string
  receiver_id: string
  created_at: string
  sender?: Profile
}

export type CallSignal = {
  id: number
  call_id: string
  from_uid: string
  to_uid: string
  kind: 'offer' | 'answer' | 'ice' | 'reject' | 'hangup'
  payload: RTCSessionDescriptionInit | RTCIceCandidateInit | null
}