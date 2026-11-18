<script setup lang="ts">
import CompareSelect from "./OptionSelect"
import { trackLibraryTask } from './organize-job'
import { computed, onMounted, ref } from 'vue'
import MaintenancePane from './MaintenancePane.vue'
import ToonOrigins from './ToonOrigins.vue'

const props = defineProps<{ section: 'download' | 'library' | 'cache' | 'network' }>()
const emit = defineEmits<{ libraryChanged: []; organize: [string, boolean, number] }>()
const policyHelp: Record<string, string> = {
  current: '작품 2개를 동시에 받고, 실패한 페이지는 짧게 최대 3번 시도합니다.',
  desktop: '작품 2개, 작품당 4페이지를 동시에 받고, 일시적 오류는 약 1초 간격으로 최대 20번 다시 시도합니다.',
  safe: '작품 1개씩, 페이지 사이에 0.5~1.5초 간격을 두고 일시적 오류는 2초~1분 간격으로 최대 7번 다시 시도합니다.',
}
const databaseFile = ref<HTMLInputElement>()
const importing = ref(false)
const importMessage = ref('')

async function importLibrary(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) return
  importing.value = true
  importMessage.value = ''
  try {
    const preview = await fetch('/api/library/import?preview=true', { method: 'POST', body: file })
    if (!preview.ok) throw new Error(await preview.text())
    const count: { works: number; files: number } = await preview.json()
    if (!count.files) {
      importMessage.value = '현재 Hitomi 폴더와 경로가 일치하는 파일이 없습니다.'
      return
    }
    if (!window.confirm(`작품 ${count.works.toLocaleString()}개, 파일 ${count.files.toLocaleString()}개를 가져올까요?`)) return
    const imported = await trackLibraryTask('DB 가져오기', async (): Promise<typeof count> => {
      const response = await fetch('/api/library/import', { method: 'POST', body: file })
      if (!response.ok) throw new Error(await response.text())
      return response.json()
    }, result => result.files)
    importMessage.value = `라이브러리 파일 ${imported.files.toLocaleString()}개를 가져왔습니다.`
    emit('libraryChanged')
  } catch (error) {
    importMessage.value = `DB 가져오기 실패 · ${String(error)}`
  } finally {
    input.value = ''
    importing.value = false
  }
}
type CacheSettings = { prefetch: boolean; prefetch_pages: number; retention_hours: number; cache_mb: number }
type Preferences = CacheSettings & { cover_cache_mb: number;
  library_path: string
  ehentai_path: string
  toon_path: string
  wolf_path: string
  cache_path: string
  name_template: string
  ehentai_name_template: string
  organize_new_hitomi: boolean
  network: { dns: 'system' | 'cloudflare' | 'google' | 'adguard'; split_tls: boolean; image_policy: 'current' | 'desktop' | 'safe' }
  archive: boolean
  image_format: 'webp' | 'avif'
  ehentai_cache: CacheSettings
  comics_cache: CacheSettings
}
type Settings = { preferences: Preferences; library_root: string; default_hitomi_library: string; data_root: string; active_library: string; active_ehentai_library: string; active_toon_library: string; active_wolf_library: string; active_cache_parent: string; library_path_error: string | null; ehentai_path_error: string | null; cache_bytes: number; ehentai_cache_bytes: number; comics_cache_bytes: number; cover_cache_bytes: number }
type Folders = { path: string; parent: string | null; absolute: string; children: string[] }
const folderTargets = [
  { key: 'library_path', label: 'Hitomi 다운로드', active: 'active_library', error: 'library_path_error' },
  { key: 'ehentai_path', label: 'E-Hentai 다운로드', active: 'active_ehentai_library', error: 'ehentai_path_error' },
  { key: 'toon_path', label: '일일툰 다운로드', active: 'active_toon_library', error: null },
  { key: 'wolf_path', label: '늑대툰 다운로드', active: 'active_wolf_library', error: null },
  { key: 'cache_path', label: '캐시', active: 'active_cache_parent', error: null },
] as const
type FolderTarget = typeof folderTargets[number]['key']
const settings = ref<Settings>()
const cacheSource = ref<'hitomi' | 'ehentai' | 'comics'>('hitomi')
const cacheConfig = computed(() => cacheSource.value === 'ehentai' ? settings.value?.preferences.ehentai_cache : cacheSource.value === 'comics' ? settings.value?.preferences.comics_cache : settings.value?.preferences)
const usageField = computed(() => cacheSource.value === 'ehentai' ? 'ehentai_cache_bytes' : cacheSource.value === 'comics' ? 'comics_cache_bytes' : 'cache_bytes')
const folders = ref<Folders>()
const folderTarget = ref<FolderTarget>()
function selectedFolder({ preferences, library_root, default_hitomi_library, data_root }: Settings, target: FolderTarget) {
  const hitomiPath = preferences.library_path || default_hitomi_library
  switch (target) {
    case 'library_path': return hitomiPath
    case 'cache_path': return preferences.cache_path || data_root
    case 'toon_path': case 'wolf_path': {
      const separator = library_root.includes('\\') ? '\\' : '/'
      const base = library_root + (library_root.endsWith(separator) ? '' : separator) + 'toon' + separator
      return preferences[target] || base + (target === 'toon_path' ? '11toon' : 'wolftoon')
    }
    case 'ehentai_path': {
      const separator = library_root.includes('\\') ? '\\' : '/'
      const joinEhentai = (path: string) => path + (path.endsWith(separator) ? '' : separator) + 'E-Hentai'
      const separate = joinEhentai(library_root)
      const insideEhentai = hitomiPath === separate || hitomiPath.startsWith(separate + separator)
      return preferences.ehentai_path || (insideEhentai && default_hitomi_library === library_root ? joinEhentai(hitomiPath) : separate)
    }
  }
}
const browseDataRoot = ref(false)
const busy = ref(false)
const message = ref('')
const error = ref('')
async function load() {
  const response = await fetch('/api/settings')
  if (!response.ok) throw new Error('설정을 불러오지 못했습니다.')
  settings.value = await response.json()
}
async function run(task: () => Promise<void>) {
  if (busy.value) return
  busy.value = true
  error.value = ''
  message.value = ''
  try { await task() }
  catch (cause) { error.value = cause instanceof Error ? cause.message : String(cause) }
  finally { busy.value = false }
}
function save() {
  void run(async () => {
    if (!settings.value) return
    const payload = props.section === 'cache'
      ? { section: 'cache', source: cacheSource.value, ...cacheConfig.value, cover_cache_mb: settings.value.preferences.cover_cache_mb }
      : { section: props.section, ...settings.value.preferences }
    const response = await fetch('/api/settings', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    if (!response.ok) throw new Error(response.status === 400 ? await response.text() : '설정을 저장하지 못했습니다.')
    const updated: Settings = await response.json()
    const pathsChanged = updated.active_library !== settings.value.active_library
      || updated.active_ehentai_library !== settings.value.active_ehentai_library
    settings.value = updated
    if (pathsChanged) emit('libraryChanged')
    message.value = props.section === 'network' ? '저장했습니다. 새 요청부터 적용됩니다.' : '저장했습니다.'
  })
}
function clearCache() {
  void run(async () => {
    const response = await fetch(cacheSource.value === 'hitomi' ? '/api/settings/cache' : `/api/settings/cache/${cacheSource.value}`, { method: 'DELETE' })
    if (!response.ok) throw new Error('캐시를 비우지 못했습니다.')
    if (settings.value) settings.value[usageField.value] = 0
    message.value = '캐시를 비웠습니다.'
  })
}
function clearCoverCache() {
  void run(async () => {
    const response = await fetch('/api/settings/cover-cache', { method: 'DELETE' })
    if (!response.ok) throw new Error('표지를 비우지 못했습니다.')
    if (settings.value) settings.value.cover_cache_bytes = 0
    message.value = '표지를 비웠습니다.'
  })
}
function browse(path = '', dataRoot = browseDataRoot.value) {
  void run(async () => {
    const response = await fetch(`/api/settings/library-folders?${new URLSearchParams({ path, data_root: String(dataRoot) })}`)
    if (!response.ok) throw new Error('폴더를 열지 못했습니다.')
    folders.value = await response.json()
    browseDataRoot.value = dataRoot
  })
}
function closeFolderBrowser() {
  folders.value = undefined
  folderTarget.value = undefined
}
function toggleFolder(target: FolderTarget) {
  const wasOpen = folderTarget.value === target
  closeFolderBrowser()
  if (wasOpen) return
  folderTarget.value = target
  browse('', target === 'cache_path')
}
function selectFolder() {
  const key = folderTarget.value
  if (!settings.value || !folders.value || !key) return
  const useDefault = !folders.value.path && (key === 'library_path' || (key === 'cache_path' && browseDataRoot.value))
  settings.value.preferences[key] = useDefault ? '' : folders.value.absolute
  closeFolderBrowser()
}
onMounted(() => run(load))
</script>

<template>
  <form v-if="settings" @submit.prevent="save">
    <template v-if="section === 'network'">
      <label>DNS 서버<CompareSelect v-model="settings.preferences.network.dns">
        <option value="system">시스템 기본값</option>
        <option value="cloudflare">Cloudflare (DoH)</option>
        <option value="google">Google (DoH)</option>
        <option value="adguard">AdGuard (DoH, 필터링 없음)</option>
      </CompareSelect></label>
      <p class="auth-help">Cloudflare, Google, AdGuard를 선택하면 DNS over HTTPS(DoH)를 사용합니다.</p>
      <label class="checkbox"><USwitch v-model="settings.preferences.network.split_tls" />HTTPS 연결 호환 모드</label>
      <p class="auth-help">HTTPS 연결이 시작 단계에서 끊길 때 사용하세요. 저장하면 새 외부 요청부터 적용됩니다.</p>
      <label>이미지 요청 규칙<CompareSelect v-model="settings.preferences.network.image_policy">
        <option value="current">기본</option>
        <option value="desktop">데스크톱 앱과 동일</option>
        <option value="safe">안전 (느림)</option>
      </CompareSelect></label>
      <p class="auth-help">{{ policyHelp[settings.preferences.network.image_policy] }} 거부가 반복되면 다운로드 이미지 요청을 40초~1분30초 쉬었다가 자동으로 이어받습니다. 표지와 바로 읽기는 쉬지 않습니다.</p>
      <ToonOrigins site="toon" label="일일툰" example="103.204.13.68:8904" />
      <ToonOrigins site="wolf" label="늑대툰" example="wfwf540.com" />
    </template>
    <template v-else-if="section === 'download'">
      <label>이미지 형식<CompareSelect v-model="settings.preferences.image_format"><option value="webp">WebP</option><option value="avif">AVIF</option></CompareSelect></label>
      <label>저장 방식<CompareSelect v-model="settings.preferences.archive"><option :value="true">CBZ 압축</option><option :value="false">이미지 폴더</option></CompareSelect></label>
      <label>Hitomi 파일명 규칙<UInput v-model="settings.preferences.name_template" maxlength="512" required /></label>
      <label>E-Hentai 파일명 규칙<UInput v-model="settings.preferences.ehentai_name_template" maxlength="512" required /></label>
      <label class="checkbox"><USwitch v-model="settings.preferences.organize_new_hitomi" />새 Hitomi 다운로드를 ID 구간별로 저장</label>
      <p class="auth-help"><code>{artists} {title} {id} {language} {language_localname} {type_field}</code>를 사용할 수 있습니다. <code>/</code>로 하위 폴더를 나누고 마지막 부분에 <code>{id}</code>를 넣으세요.</p>
    </template>
    <template v-else-if="section === 'library'">
      <section v-for="target in folderTargets" :key="target.key" class="folder-setting" :aria-labelledby="'folder-' + target.key">
        <h3 :id="'folder-' + target.key">{{ target.label }}</h3>
        <p class="auth-help active-folder">현재 사용 중 <code>{{ settings[target.active] }}</code></p>
        <div class="folder-selection">
          <div>
            <small>선택한 서버 폴더</small>
            <strong>{{ selectedFolder(settings, target.key) }}</strong>
          </div>
          <UButton variant="ghost" color="neutral" type="button" class="secondary-button" :aria-expanded="folderTarget === target.key" :aria-label="target.label + (folderTarget === target.key ? ' 탐색 닫기' : ' 폴더 찾아보기')" :disabled="busy" @click="toggleFolder(target.key)">{{ folderTarget === target.key ? '탐색 닫기' : '폴더 찾아보기' }}</UButton>
        </div>
        <p v-if="target.error && settings[target.error]" class="auth-help" role="alert">선택한 경로를 적용하지 못했습니다. {{ settings[target.error] }}</p>
        <p v-else-if="settings[target.active] !== selectedFolder(settings, target.key)" class="auth-help">{{ target.key === 'cache_path' ? '캐시 경로는 저장 후 컨테이너를 재시작하면 적용됩니다.' : '설정을 저장하면 새 다운로드부터 이 폴더를 사용합니다.' }}</p>
        <div v-if="folderTarget === target.key && target.key === 'cache_path' && settings.library_root !== settings.data_root" class="cache-sources" role="group" aria-label="캐시 폴더 탐색 위치">
          <UButton :variant="(browseDataRoot) ? 'solid' : 'outline'" :color="(browseDataRoot) ? 'primary' : 'neutral'" type="button" :aria-pressed="browseDataRoot" :disabled="busy" @click="browse('', true)">데이터 폴더</UButton>
          <UButton :variant="(!browseDataRoot) ? 'solid' : 'outline'" :color="(!browseDataRoot) ? 'primary' : 'neutral'" type="button" :aria-pressed="!browseDataRoot" :disabled="busy" @click="browse('', false)">라이브러리 폴더</UButton>
        </div>
        <section v-if="folderTarget === target.key && folders" class="folder-browser" aria-label="서버 폴더 탐색" :aria-busy="busy">
          <div class="folder-toolbar">
            <UButton variant="ghost" color="neutral" v-if="folders.parent !== null" type="button" class="secondary-button" :disabled="busy" @click="browse(folders.parent)">↑ 상위 폴더</UButton>
            <code>{{ folders.absolute }}</code>
          </div>
          <ul v-if="folders.children.length">
            <li v-for="name in folders.children" :key="name">
              <UButton variant="ghost" color="neutral" type="button" class="folder-row" :disabled="busy" @click="browse(folders.path ? folders.path + '/' + name : name)">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true"><path d="M3 7a2 2 0 0 1 2-2h5l2 2h7a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/></svg>
                <span>{{ name }}</span><span aria-hidden="true">›</span>
              </UButton>
            </li>
          </ul>
          <p v-else class="auth-help">하위 폴더가 없습니다.</p>
          <UButton variant="ghost" color="neutral" type="button" class="secondary-button" :disabled="busy" @click="selectFolder">이 폴더 선택</UButton>
        </section>
        <UButton variant="ghost" color="neutral" v-if="settings.preferences[target.key] && folderTarget !== target.key" type="button" class="secondary-button" :disabled="busy" @click="settings.preferences[target.key] = ''">기본값 사용</UButton>
      </section>
    </template>
    <template v-else-if="cacheConfig">
      <div class="cache-sources" role="group" aria-label="온라인 읽기 캐시 출처">
        <UButton :variant="(cacheSource === 'hitomi') ? 'solid' : 'outline'" :color="(cacheSource === 'hitomi') ? 'primary' : 'neutral'" type="button" :aria-pressed="cacheSource === 'hitomi'" :disabled="busy" @click="cacheSource = 'hitomi'">Hitomi</UButton>
        <UButton :variant="(cacheSource === 'ehentai') ? 'solid' : 'outline'" :color="(cacheSource === 'ehentai') ? 'primary' : 'neutral'" type="button" :aria-pressed="cacheSource === 'ehentai'" :disabled="busy" @click="cacheSource = 'ehentai'">E-Hentai</UButton>
        <UButton :variant="(cacheSource === 'comics') ? 'solid' : 'outline'" :color="(cacheSource === 'comics') ? 'primary' : 'neutral'" type="button" :aria-pressed="cacheSource === 'comics'" :disabled="busy" @click="cacheSource = 'comics'">만화</UButton>
      </div>
      <label class="checkbox"><USwitch v-model="cacheConfig.prefetch" />다음 페이지 미리 캐싱</label>
      <label>캐싱 범위<CompareSelect v-model="cacheConfig.prefetch_pages" :disabled="!cacheConfig.prefetch"><option v-for="pages in [1, 3, 5, 10]" :key="pages" :value="pages">다음 {{ pages }}페이지</option></CompareSelect></label>
      <label>보존 기간<CompareSelect v-model="cacheConfig.retention_hours"><option :value="1">1시간</option><option :value="24">24시간</option><option :value="168">7일</option></CompareSelect></label>
      <label>최대 용량<CompareSelect v-model="cacheConfig.cache_mb"><option v-for="mb in [128, 512, 1024, 2048, 4096, 5120]" :key="mb" :value="mb">{{ mb >= 1024 ? mb / 1024 + ' GB' : mb + ' MB' }}</option></CompareSelect></label>
      <div class="cache-usage"><span>사용량 {{ (settings[usageField] / 1024 / 1024).toFixed(1) }} MB</span><UButton variant="outline" color="neutral" type="button" :disabled="busy" @click="clearCache">캐시 비우기</UButton></div>
      <h3 class="cover-cache-title">표지 저장 (Hitomi·E-Hentai 공통)</h3>
      <p class="cover-cache-help">한 번 받은 표지를 서버에 보관해 같은 표지를 외부에서 다시 받지 않습니다. 용량을 넘으면 오래 안 쓰인 표지부터 지웁니다.</p>
      <label>최대 용량<CompareSelect v-model="settings.preferences.cover_cache_mb"><option v-for="mb in [512, 1024, 2048, 4096]" :key="mb" :value="mb">{{ mb >= 1024 ? mb / 1024 + ' GB' : mb + ' MB' }}</option></CompareSelect></label>
      <div class="cache-usage"><span>사용량 {{ (settings.cover_cache_bytes / 1024 / 1024).toFixed(1) }} MB</span><UButton variant="outline" color="neutral" type="button" :disabled="busy" @click="clearCoverCache">표지 비우기</UButton></div>
    </template>
    <UButton type="submit" class="primary-button" :disabled="busy || !!folderTarget">설정 저장</UButton>
  </form>
  <UButton variant="outline" color="neutral" v-else-if="!busy" @click="run(load)">다시 불러오기</UButton>
  <div v-if="settings && section === 'library'">
    <input ref="databaseFile" type="file" accept=".db" hidden :disabled="importing" @change="importLibrary" />
    <UButton variant="outline" color="neutral" type="button" :disabled="importing" @click="databaseFile?.click()">DB 가져오기</UButton>
    <p v-if="importing || importMessage" role="status">{{ importing ? 'DB 가져오는 중…' : importMessage }}</p>
  </div>
  <MaintenancePane v-if="settings && section === 'library'" @organize="(token, trial, total) => emit('organize', token, trial, total)" />
  <p v-if="error" role="alert">{{ error }}</p>
  <p v-if="message" role="status">{{ message }}</p>
</template>

<style scoped>
.cover-cache-title{margin:20px 0 0;font-size:15px}.cover-cache-help{margin:0;font-size:13px;color:var(--muted)}
.cache-sources{display:flex;flex-wrap:wrap;gap:6px}
.checkbox,.cache-usage{display:flex;align-items:center;gap:8px}

.cache-usage{justify-content:space-between;flex-wrap:wrap}
.folder-selection,.folder-toolbar{display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap}
.folder-selection>div{display:grid;gap:4px;min-width:0}
.folder-setting{display:grid;gap:12px;min-width:0}
.folder-setting+.folder-setting{border-top:1px solid var(--line);padding-top:16px}
.folder-setting h3{margin:0;font-size:1rem}
.folder-setting>button{justify-self:start}
.active-folder code,.folder-toolbar code{overflow-wrap:anywhere}
.folder-selection strong{overflow-wrap:anywhere}
.folder-browser{display:grid;gap:12px;padding:12px;border:0;border-radius:14px;background:var(--canvas)}
.folder-toolbar code{font-size:12px;color:var(--muted)}
.folder-browser ul{list-style:none;margin:0;padding:0;max-height:270px;overflow:auto}
.folder-row{display:grid;grid-template-columns:20px minmax(0,1fr) auto;gap:10px;align-items:center;text-align:left;width:100%;min-height:48px;background:transparent;border:0}
.folder-row span{overflow-wrap:anywhere}
.folder-row svg,.folder-row span:last-child{color:var(--accent)}
.folder-browser>button{justify-self:start}
</style>
