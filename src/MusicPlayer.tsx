import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Maximize2, Minimize2, Music2, Pause, Play, Search, SkipBack, SkipForward, Volume2, VolumeX, X } from 'lucide-react'

type PlayerMode = 'button' | 'mini' | 'full'
type DeezerTrack = {
  id: number
  title: string
  duration: number
  preview: string
  artist: { name: string }
  album: { title: string; cover_medium: string; cover_big: string }
}

const formatTime = (value: number) => `${Math.floor(value / 60)}:${String(Math.floor(value % 60)).padStart(2, '0')}`

export default function MusicPlayer() {
  const audioRef = useRef<HTMLAudioElement>(null)
  const [mode, setMode] = useState<PlayerMode>('button')
  const [query, setQuery] = useState('')
  const [tracks, setTracks] = useState<DeezerTrack[]>([])
  const [trackIndex, setTrackIndex] = useState(0)
  const [playing, setPlaying] = useState(false)
  const [progress, setProgress] = useState(0)
  const [volume, setVolume] = useState(0.7)
  const [loading, setLoading] = useState(false)
  const [searchError, setSearchError] = useState('')

  const track = tracks[trackIndex]

  const searchTracks = async (event?: FormEvent) => {
    event?.preventDefault()
    const term = query.trim() || 'popular hits'
    setLoading(true)
    setSearchError('')
    try {
      const response = await fetch(`https://api.deezer.com/search?q=${encodeURIComponent(term)}&limit=20`)
      if (!response.ok) throw new Error('Не удалось получить список треков')
      const result = await response.json() as { data?: DeezerTrack[]; error?: { message?: string } }
      if (result.error?.message) throw new Error(result.error.message)
      const found = (result.data ?? []).filter((item) => item.preview)
      setTracks(found)
      setTrackIndex(0)
      setProgress(0)
      if (!found.length) setSearchError('По этому запросу ничего не найдено')
    } catch (caught) {
      setSearchError(caught instanceof Error ? caught.message : 'Поиск музыки недоступен')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void searchTracks()
  }, [])

  useEffect(() => {
    if (!audioRef.current) return
    audioRef.current.volume = volume
  }, [volume])

  const togglePlayback = async () => {
    const audio = audioRef.current
    if (!audio || !track?.preview) return
    if (audio.paused) {
      try {
        await audio.play()
        setPlaying(true)
      } catch {
        setPlaying(false)
      }
    } else {
      audio.pause()
      setPlaying(false)
    }
  }

  const selectTrack = async (index: number) => {
    setTrackIndex(index)
    setProgress(0)
    setPlaying(false)
    window.setTimeout(() => {
      const audio = audioRef.current
      if (!audio) return
      void audio.play().then(() => setPlaying(true)).catch(() => setPlaying(false))
    }, 0)
  }

  const stepTrack = (direction: number) => {
    if (!tracks.length) return
    const next = (trackIndex + direction + tracks.length) % tracks.length
    void selectTrack(next)
  }

  return <aside className={`music-player music-player-${mode}`} aria-label="Музыкальный плеер">
    {mode === 'button' && <button type="button" className="music-player-button" aria-label="Открыть плеер" title="Музыкальный плеер" onClick={() => setMode('mini')}><Music2 size={21} /></button>}
    {mode !== 'button' && <>
      <header className="music-player-header">
        <div className="music-player-brand"><span><Music2 size={15} /></span><strong>{mode === 'full' ? 'Музыка' : 'Сейчас играет'}</strong></div>
        <div className="music-player-header-actions">
          <button type="button" className="icon-button" aria-label={mode === 'full' ? 'Свернуть плеер' : 'Развернуть плеер'} onClick={() => setMode(mode === 'full' ? 'mini' : 'full')}>{mode === 'full' ? <Minimize2 size={16} /> : <Maximize2 size={16} />}</button>
          <button type="button" className="icon-button" aria-label="Закрыть плеер" onClick={() => setMode('button')}><X size={16} /></button>
        </div>
      </header>
      {mode === 'full' && <form className="music-player-search" onSubmit={(event) => void searchTracks(event)}>
        <Search size={16} />
        <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Поиск треков и исполнителей" aria-label="Поиск музыки" />
        <button type="submit" disabled={loading}>{loading ? 'Поиск…' : 'Найти'}</button>
      </form>}
      {track ? <div className={`music-player-current${mode === 'full' ? ' music-player-current-full' : ''}`}>
        <img src={mode === 'full' ? track.album.cover_big || track.album.cover_medium : track.album.cover_medium} alt="" />
        <div className="music-player-track"><strong>{track.title}</strong><span>{track.artist.name}</span></div>
        {mode === 'full' && <button type="button" className="music-player-source" aria-label="Открыть источник трека" title="Открыть источник в Deezer" onClick={() => window.open(`https://www.deezer.com/search/${encodeURIComponent(`${track.artist.name} ${track.title}`)}`, '_blank', 'noopener,noreferrer')}>Deezer</button>}
      </div> : <div className="music-player-empty">{searchError || 'Загрузка популярной музыки…'}</div>}
      <audio
        ref={audioRef}
        src={track?.preview}
        preload="metadata"
        onTimeUpdate={(event) => setProgress(event.currentTarget.currentTime)}
        onLoadedMetadata={(event) => { if (Number.isFinite(event.currentTarget.duration)) event.currentTarget.volume = volume }}
        onPause={() => setPlaying(false)}
        onPlay={() => setPlaying(true)}
        onEnded={() => stepTrack(1)}
      />
      <div className="music-player-progress">
        <span>{formatTime(progress)}</span>
        <input type="range" min={0} max={30} step={0.1} value={Math.min(progress, 30)} onChange={(event) => { const value = Number(event.target.value); if (audioRef.current) audioRef.current.currentTime = value; setProgress(value) }} aria-label="Позиция трека" />
        <span>0:30</span>
      </div>
      <div className="music-player-controls">
        <button type="button" className="icon-button" aria-label="Предыдущий трек" onClick={() => stepTrack(-1)}><SkipBack size={18} /></button>
        <button type="button" className="music-player-play" aria-label={playing ? 'Пауза' : 'Воспроизвести'} onClick={() => void togglePlayback()}>{playing ? <Pause size={19} fill="currentColor" /> : <Play size={19} fill="currentColor" />}</button>
        <button type="button" className="icon-button" aria-label="Следующий трек" onClick={() => stepTrack(1)}><SkipForward size={18} /></button>
        <label className="music-player-volume" title="Громкость">{volume ? <Volume2 size={16} /> : <VolumeX size={16} />}<input type="range" min={0} max={1} step={0.05} value={volume} onChange={(event) => setVolume(Number(event.target.value))} aria-label="Громкость" /></label>
      </div>
      {mode === 'full' && <div className="music-player-results">
        {searchError && <span className="music-player-search-error">{searchError}</span>}
        {tracks.map((item, index) => <button type="button" className={`music-player-result${index === trackIndex ? ' active' : ''}`} key={item.id} onClick={() => void selectTrack(index)}>
          <img src={item.album.cover_medium} alt="" />
          <span><strong>{item.title}</strong><small>{item.artist.name}</small></span>
          {index === trackIndex && playing ? <Pause size={15} fill="currentColor" /> : <Play size={15} fill="currentColor" />}
        </button>)}
      </div>}
    </>}
  </aside>
}
