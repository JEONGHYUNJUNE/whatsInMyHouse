import { createContext, useCallback, useContext, useEffect, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'
import type { Profile } from '../types'

type AuthValue = {
  session: Session | null
  profile: Profile | null
  loading: boolean
  signInWithGoogle: () => Promise<void>
  signInWithCredentials: (username: string, password: string) => Promise<void>
  signUpWithCredentials: (username: string, password: string, nickname: string) => Promise<void>
  signOut: () => Promise<void>
  refreshProfile: () => Promise<void>
}

const AuthContext = createContext<AuthValue | null>(null)

const usernamePattern = /^[a-z0-9._-]{4,20}$/
const toAuthEmail = (username: string) => `${username.trim().toLowerCase()}@whats-in-my-house.app`

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [loading, setLoading] = useState(true)

  const loadProfile = useCallback(async (nextSession: Session | null) => {
    setSession(nextSession)
    if (!nextSession?.user) {
      setProfile(null)
      setLoading(false)
      return
    }

    const { data, error } = await supabase
      .from('profiles')
      .select('id, auth_user_id, username, nickname, avatar_url')
      .eq('auth_user_id', nextSession.user.id)
      .maybeSingle()

    if (error) console.warn('프로필 조회 실패:', error.message)
    setProfile(data)
    setLoading(false)
  }, [])

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => loadProfile(data.session))
    const { data } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setTimeout(() => loadProfile(nextSession), 0)
    })
    return () => data.subscription.unsubscribe()
  }, [loadProfile])

  const signInWithGoogle = async () => {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: window.location.origin },
    })
    if (error) throw error
  }

  const signInWithCredentials = async (username: string, password: string) => {
    const normalized = username.trim().toLowerCase()
    if (!usernamePattern.test(normalized)) {
      throw new Error('아이디는 영문 소문자, 숫자, 점, 밑줄, 하이픈으로 4~20자 입력해 주세요.')
    }
    const { error } = await supabase.auth.signInWithPassword({ email: toAuthEmail(normalized), password })
    if (error) {
      if (error.message.toLowerCase().includes('invalid login')) throw new Error('아이디 또는 비밀번호가 맞지 않습니다.')
      throw error
    }
  }

  const signUpWithCredentials = async (username: string, password: string, nickname: string) => {
    const normalized = username.trim().toLowerCase()
    const cleanNickname = nickname.trim()
    if (!usernamePattern.test(normalized)) {
      throw new Error('아이디는 영문 소문자, 숫자, 점, 밑줄, 하이픈으로 4~20자 입력해 주세요.')
    }
    if (password.length < 8) throw new Error('비밀번호는 8자 이상 입력해 주세요.')
    if (!cleanNickname || cleanNickname.length > 30) throw new Error('별칭은 1~30자로 입력해 주세요.')

    const { data, error } = await supabase.auth.signUp({
      email: toAuthEmail(normalized),
      password,
      options: { data: { username: normalized, nickname: cleanNickname, name: cleanNickname } },
    })
    if (error) {
      const message = error.message.toLowerCase()
      if (message.includes('already registered')) throw new Error('이미 사용 중인 아이디입니다.')
      if (message.includes('email address') && message.includes('invalid')) {
        throw new Error('아이디 가입 설정이 완료되지 않았습니다. 관리자에게 Supabase 이메일 Hook 설정을 요청해 주세요.')
      }
      throw error
    }
    if (!data.session) {
      throw new Error('가입은 생성됐지만 로그인되지 않았습니다. Supabase에서 이메일 확인 옵션을 꺼주세요.')
    }
  }

  const signOut = async () => {
    await supabase.auth.signOut()
  }

  const refreshProfile = async () => {
    const { data } = await supabase.auth.getSession()
    await loadProfile(data.session)
  }

  return <AuthContext.Provider value={{ session, profile, loading, signInWithGoogle, signInWithCredentials, signUpWithCredentials, signOut, refreshProfile }}>{children}</AuthContext.Provider>
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth() {
  const value = useContext(AuthContext)
  if (!value) throw new Error('AuthProvider 안에서 사용해 주세요.')
  return value
}
