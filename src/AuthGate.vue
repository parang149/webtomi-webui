<script setup lang="ts">
import RequestStats from './RequestStats.vue'
import WebuiAbout from './WebuiAbout.vue'
import CompareSelect from "./OptionSelect"
import { nextTick, onMounted, onUnmounted, ref } from 'vue'
import App from './App.vue'
import SettingsPane from './SettingsPane.vue'
import { notify } from './notifications'
import LibraryApiSettings from './LibraryApiSettings.vue'
import { startOrganize } from './organize-job'
import MaintenancePane from './MaintenancePane.vue'
import { excludeAiGeneratedDefault, excludeGayTagsDefault, filterLayout } from './search-appearance'
import { installAuthFetch, setCsrf } from './auth-client'
installAuthFetch()
const ready=ref(false), configured=ref(false), authenticated=ref(false), secureReady=ref(true), setupAllowed=ref(false)
const setupConfirm=ref('')
const manageHttps = ref(false)
const httpsOrigins = ref(''), httpsLoaded = ref(false), httpsMessage = ref('')
const password=ref(''), remember=ref(false), busy=ref(false), error=ref(''), message=ref('')
const reading=ref(false)
const generation=ref(0)
const libraryRevision = ref(0)
const workRevision = ref(0)
async function organize(token: string, trial: boolean, total: number) {
  const job = startOrganize(token, trial, total)
  history.replaceState(history.state, '', location.pathname + location.search)
  syncScreen()
  workRevision.value++
  await job
  libraryRevision.value++
}
const settingsOpen = ref(false)
const settingsTitle = ref<HTMLHeadingElement>()
const settingsButton = ref<HTMLButtonElement>()
let appScroll = 0
const currentPassword=ref(''), newPassword=ref(''), confirmPassword=ref('')
const settingsTabs = [{ key: 'security', label: '접속·보안' }, { key: 'network', label: '네트워크' }, { key: 'api', label: 'API' }, { key: 'download', label: '다운로드' }, { key: 'library', label: '라이브러리' }, { key: 'logs', label: '로그' }, { key: 'cache', label: '온라인 읽기' }, { key: 'search', label: '검색' }, { key: 'debug', label: '디버그' }, { key: 'about', label: '정보' }] as const
const section = ref<typeof settingsTabs[number]['key']>('security')
let loading=false
function expired() { authenticated.value=false; setCsrf(null); currentPassword.value='';newPassword.value='';confirmPassword.value=''; }
async function status() {
  if(loading) return
  loading=true
  try {
    const response=await fetch('/api/auth/status')
    if(!response.ok) throw new Error('로그인 상태를 확인하지 못했습니다.')
    const data=await response.json()
    const wasAuthenticated = authenticated.value
    configured.value=data.configured;authenticated.value=data.authenticated;setCsrf(data.csrf)
    secureReady.value=location.protocol!=='https:' || data.secure_cookie
    manageHttps.value = data.manage_https
    setupAllowed.value=data.setup_allowed && location.protocol==='http:'
    ready.value=true
    if (data.authenticated && settingsOpen.value && !httpsLoaded.value && !wasAuthenticated) void security()
  } catch(e) { error.value=String(e) } finally {loading=false}
}
async function login() {
  const creating=!configured.value
  if(creating && password.value!==setupConfirm.value) {error.value='비밀번호가 서로 다릅니다.';return}
  busy.value=true;error.value='';message.value=''
  try {
    if(creating) {
      const response=await fetch('/api/auth/setup',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({password:password.value})})
      if(response.status===409) { password.value='';setupConfirm.value='';await status();throw new Error('이미 비밀번호가 설정됐습니다. 로그인하세요.') }
      if(!response.ok) throw new Error(await response.text())
      configured.value=true;setupConfirm.value=''
    }
    const response=await fetch('/api/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({password:password.value,remember:remember.value})})
    if(!response.ok) throw new Error(await response.text())
    const data=await response.json();setCsrf(data.csrf);manageHttps.value=data.manage_https;password.value='';authenticated.value=true;generation.value++
    if (settingsOpen.value) void security()
  } catch(e) {error.value=e instanceof Error?e.message:String(e)} finally {busy.value=false}
}
async function logout(all=false) {
  busy.value=true;error.value=''
  try {
    const response=await fetch(`/api/auth/${all?'logout-all':'logout'}`,{method:'POST'})
    if(!response.ok && response.status!==401) throw new Error(await response.text())
    expired();message.value=all?'모든 기기에서 로그아웃했습니다.':'로그아웃했습니다.'
  } catch(e) {error.value=String(e)} finally {busy.value=false}
}
function syncScreen() {
  const open = location.hash === '#settings'
  if (open === settingsOpen.value) return
  if (open) {
    appScroll = window.scrollY
    section.value = 'security'
    if (authenticated.value) void security()
  }
  settingsOpen.value = open
  currentPassword.value = ''; newPassword.value = ''; confirmPassword.value = ''
  error.value = ''
  void nextTick(() => {
    if (open) {
      window.scrollTo(0, 0)
      settingsTitle.value?.focus({ preventScroll: true })
    } else {
      window.scrollTo(0, appScroll)
      const button = settingsButton.value
      const element = button instanceof HTMLElement ? button : (button as { $el?: HTMLElement } | undefined)?.$el
      element?.focus({ preventScroll: true })
    }
  })
}
function openSettings() {
  history.pushState({ hitomiSettings: true }, '', '#settings')
  syncScreen()
}
function closeSettings() {
  if (history.state?.hitomiSettings) history.back()
  else {
    history.replaceState(null, '', location.pathname + location.search)
    syncScreen()
  }
}
async function security() {
  error.value = ''
  httpsMessage.value = ''
  httpsLoaded.value = false
  if (!manageHttps.value) return
  try {
    const response = await fetch('/api/auth/https-settings')
    if (!response.ok) throw new Error(await response.text())
    const settings = await response.json()
    httpsOrigins.value = settings.origins
    httpsLoaded.value = true
  } catch (e) {
    error.value = e instanceof Error ? e.message : String(e)
  }
}

async function saveHttpsSettings() {
  busy.value = true
  error.value = ''
  httpsMessage.value = ''
  try {
    const response = await fetch('/api/auth/https-settings', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ origins: httpsOrigins.value }),
    })
    if (!response.ok) throw new Error(await response.text())
    httpsMessage.value = 'HTTPS 주소를 저장했습니다.'
  } catch (e) {
    error.value = e instanceof Error ? e.message : String(e)
  } finally {
    busy.value = false
  }
}
async function changePassword() {
  if(newPassword.value!==confirmPassword.value) {error.value='새 비밀번호가 서로 다릅니다.';return}
  busy.value=true;error.value=''
  try {
    const response=await fetch('/api/auth/password',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({current_password:currentPassword.value,new_password:newPassword.value})})
    if(!response.ok) throw new Error(await response.text())
    expired();message.value='비밀번호를 변경했습니다. 새 비밀번호로 로그인하세요.'
  } catch(e) {error.value=e instanceof Error?e.message:String(e)} finally {busy.value=false}
}
function visibility() {if(document.visibilityState==='visible' && authenticated.value) void status()}
onMounted(()=>{syncScreen();void status();window.addEventListener('popstate',syncScreen);window.addEventListener('hashchange',syncScreen);window.addEventListener('hitomi-auth-expired',expired);document.addEventListener('visibilitychange',visibility)})
onUnmounted(()=>{window.removeEventListener('popstate',syncScreen);window.removeEventListener('hashchange',syncScreen);window.removeEventListener('hitomi-auth-expired',expired);document.removeEventListener('visibilitychange',visibility)})
</script>
<template><UApp>
  <template v-if="ready && authenticated">
    <div v-show="!reading && !settingsOpen" class="auth-actions"><UButton ref="settingsButton" variant="soft" color="neutral" square title="설정" aria-label="설정" @click="openSettings">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" aria-hidden="true">
          <path d="M9 3h6l.5 3 2.5 1.5 2.8-1 2.2 4-2.3 2v3l2.3 2-2.2 4-2.8-1-2.5 1.5-.5 3H9l-.5-3L6 20.5l-2.8 1-2.2-4 2.3-2v-3l-2.3-2 2.2-4 2.8 1L8.5 6z" transform="translate(1 0) scale(.92)" />
          <circle cx="12" cy="12.8" r="3" />
        </svg>
      </UButton><UButton variant="soft" color="neutral" :disabled="busy" @click="logout()">로그아웃</UButton></div>
    <div v-show="!settingsOpen">
      <p v-if="error" class="auth-alert" role="alert">{{ error }}</p>
      <App :key="generation" :library-revision="libraryRevision" :work-revision="workRevision" @reading="reading=$event" />
    </div>
    <main v-if="settingsOpen" class="settings-screen" aria-labelledby="settings-title">
      <div class="settings-heading">
        <UButton variant="outline" color="neutral" type="button" class="back-button" icon="i-lucide-arrow-left" @click="closeSettings">돌아가기</UButton>
        <h1 id="settings-title" ref="settingsTitle" tabindex="-1">설정</h1>
      </div>
      <div class="settings-layout">
        <UTabs orientation="vertical" class="settings-tabs" :ui="{ list: 'w-full max-sm:grid max-sm:grid-cols-2', indicator: 'max-sm:hidden', trigger: 'max-sm:justify-center max-sm:data-[state=active]:bg-primary max-sm:data-[state=active]:text-inverted' }" aria-label="설정 항목" :content="false" :items="settingsTabs.map(tab => ({ label: tab.label, value: tab.key }))" :model-value="section" @update:model-value="value => { const tab = settingsTabs.find(tab => tab.key === value); if (tab) section = tab.key }" />
        <div :key="section" class="settings-content" role="region" aria-labelledby="settings-section-title">
          <h2 id="settings-section-title">{{ settingsTabs.find(tab => tab.key === section)?.label }}</h2>
          <WebuiAbout v-if="section === 'about'" />
          <div v-else-if="section === 'search'" class="search-preferences">
            <label>상세 조건 카드
              <CompareSelect v-model="filterLayout">
                <option value="classic">이전 방식 · 모든 입력칸 표시</option>
                <option value="compact">새 방식 · 선택한 입력칸만 표시</option>
              </CompareSelect>
            </label>
            <label class="remember"><USwitch v-model="excludeGayTagsDefault" />게이 태그 제외 기본값</label>
            <label class="remember"><USwitch v-model="excludeAiGeneratedDefault" />E-Hentai AI Generated 제목 제외 기본값</label>
            <p class="auth-help">선택하면 바로 적용되며 이 브라우저에 저장됩니다.</p>
          </div>
          <MaintenancePane v-else-if="section === 'logs'" logs />
          <LibraryApiSettings v-else-if="section === 'api'" />
          <div v-else-if="section === 'debug'" class="search-preferences">
            <UButton variant="outline" color="neutral" type="button" @click="notify('debug', '테스트 알림입니다.')">알림 테스트</UButton>
            <RequestStats />
          </div>
          <SettingsPane v-else-if="section !== 'security'" :section="section" :key="section" @library-changed="libraryRevision++" @organize="organize" />
          <div v-else class="security-content">
      <form class="settings-card" @submit.prevent="changePassword"><h3>비밀번호 변경</h3>
        <label>현재 비밀번호<UInput v-model="currentPassword" type="password" autocomplete="current-password" required maxlength="256" />
</label>
        <label>새 비밀번호<UInput v-model="newPassword" type="password" autocomplete="new-password" required minlength="8" maxlength="256" placeholder="8자 이상" />
</label>
        <label>새 비밀번호 확인<UInput v-model="confirmPassword" type="password" autocomplete="new-password" required minlength="8" maxlength="256" />
</label>
        <p class="auth-help">변경하면 모든 기기에서 다시 로그인해야 합니다.</p>
        <UButton type="submit" :disabled="busy">{{ busy?'처리 중…':'비밀번호 변경' }}</UButton>
      </form>
      <form v-if="manageHttps" class="settings-card" @submit.prevent="saveHttpsSettings">
        <h3>외부 HTTPS 주소</h3>
        <label>등록할 주소
          <UTextarea v-model="httpsOrigins" :disabled="!httpsLoaded || busy" :rows="3"
            maxlength="3000" placeholder="https://reader.example.com" />
        </label>
        <p class="auth-help">주소창의 https://와 도메인, 포트만 입력하세요. 주소가 여러 개면 한 줄에 하나씩 입력하세요.</p>
        <p v-if="httpsMessage" role="status">{{ httpsMessage }}</p>
        <UButton type="submit" :disabled="!httpsLoaded || busy">HTTPS 주소 저장</UButton>
      </form>
      <p v-else class="auth-help">외부 HTTPS 주소는 서버의 내부 IP로 로그인한 뒤 등록할 수 있습니다.</p>
      <p v-if="error" role="alert">{{ error }}</p>
      <UButton color="error" class="danger-button" :disabled="busy" @click="logout(true)">모든 기기 로그아웃</UButton>
          </div>
        </div>
      </div>
    </main>
  </template>
  <section v-else class="login-screen"><div class="login-card">
    <img src="/icon.png" alt="Hitomi Web" width="68" height="68"><h1>{{ !ready?'접속 확인':!configured ? '초기 비밀번호 설정' : '라이브러리 로그인' }}</h1>
    <p v-if="message" class="auth-help" role="status">{{ message }}</p>
    <template v-if="ready && !configured && !setupAllowed"><p>같은 네트워크에서 서버의 내부 IP 주소로 접속해 비밀번호를 설정하세요.</p><UButton variant="outline" color="neutral" @click="status">다시 확인</UButton></template>
    <template v-else-if="ready && !secureReady"><p>이 HTTPS 접속 주소가 서버에 등록되지 않았습니다.</p><p class="auth-help">서버의 내부 IP 주소로 로그인한 뒤 설정에서 이 HTTPS 주소를 등록하세요.</p><UButton variant="outline" color="neutral" @click="status">다시 확인</UButton></template>
    <form v-else-if="ready" @submit.prevent="login"><label>비밀번호<UInput v-model="password" type="password" :autocomplete="configured?'current-password':'new-password'" :minlength="configured?undefined:8" required maxlength="256" autofocus />
</label><label v-if="!configured">비밀번호 확인<UInput v-model="setupConfirm" type="password" autocomplete="new-password" required minlength="8" maxlength="256" />
</label><label class="remember"><USwitch v-model="remember" />로그인 유지 <span>30일</span></label><UButton type="submit" block class="login-button" :disabled="busy">{{ busy?'처리 중…':configured?'로그인':'설정하고 시작' }}</UButton></form>
    <p v-if="error" role="alert">{{ error }}</p><UButton variant="outline" color="neutral" v-if="!ready && error" @click="status">다시 시도</UButton>
  </div></section>
</UApp></template>
<style scoped>
.auth-actions{display:flex;justify-content:flex-end;gap:8px;max-width:1100px;margin:auto;padding:12px 20px 0}
.settings-button{display:grid;place-items:center;width:44px;min-width:44px}
.auth-alert{max-width:1060px;margin:12px auto;color:var(--danger)}
.login-screen{min-height:100dvh;display:grid;place-items:center;padding:20px}
.login-card{width:min(100%,380px);padding:28px;background:var(--surface);border:0;border-radius:16px;box-shadow:0 18px 64px #0004}
.login-card>img{display:block;border-radius:14px;margin-bottom:22px}
.login-card h1{font-size:23px;margin-bottom:24px}
.login-card form,.settings-content :deep(form){display:grid;gap:16px}
.remember{display:flex;align-items:center;gap:8px;min-height:44px}

.remember span{margin-left:auto;color:var(--muted);font-size:12px}

.auth-help,.settings-content :deep(.auth-help){font-size:13px;color:var(--muted);line-height:1.65;overflow-wrap:anywhere;margin:0}
.settings-screen{max-width:1180px}
.settings-heading{display:flex;align-items:center;gap:16px;padding:8px 0 22px;margin-bottom:22px}
.settings-heading h1{margin:0;font-size:24px;outline:none}
.back-button{white-space:nowrap}
.settings-layout{display:grid;grid-template-columns:195px minmax(0,1fr);gap:28px;align-items:start}
.settings-tabs{display:grid;gap:4px;position:sticky;top:20px;margin:0;padding:8px;background:var(--surface);border:0;border-radius:12px}
.settings-tabs button{width:100%;text-align:left}

.settings-content{max-width:740px;min-width:0}
.settings-content h2{margin:0 0 16px;font-size:20px}
.settings-content h3{margin:0;font-size:16px}
.settings-content :deep(form){padding:20px;border:0;border-radius:12px;background:var(--surface)}
.settings-content :deep(form>button:last-child){justify-self:start}
.security-content{display:grid;gap:16px}
.search-preferences{display:grid;gap:12px;padding:20px;border:0;border-radius:12px;background:var(--surface)}
.danger-button{justify-self:start}
[role=alert]{color:var(--danger);font-size:13px;overflow-wrap:anywhere}
@media(max-width:640px){
  .auth-actions{padding:8px 12px 0}
  .settings-heading{padding:4px 0 14px;margin-bottom:12px}
  .settings-layout{grid-template-columns:minmax(0,1fr);gap:18px}
  .settings-tabs{position:static}
  .settings-content :deep(form){padding:14px}
}
</style>

<style scoped>
@media (prefers-reduced-motion:no-preference){.settings-content{animation:settings-fade 160ms ease-out}}
@keyframes settings-fade{from{opacity:0}to{opacity:1}}
</style>

