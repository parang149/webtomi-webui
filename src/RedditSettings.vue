<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue'
import RedditSubreddits from './RedditSubreddits.vue'
import { loadReddit, redditStatus, redditRequest, refreshRedditSubscribers } from './reddit-client'
const redgifsOriginal = ref(false), freshList = ref(true)
const showTitles = ref(true), batchSize = ref(30)
const mode = ref<'download' | 'online'>('download')
const subreddits = ref<string[]>([])
const enabled = ref(false), subreddit = ref(''), allMedia = ref(false), busy = ref(false), error = ref('')
let timer: ReturnType<typeof setInterval> | undefined
async function load() { await loadReddit(); const c = redditStatus.value!.config; freshList.value = c.fresh_list ?? true; redgifsOriginal.value = c.redgifs_original ?? false; enabled.value = c.enabled; subreddit.value = c.subreddit; subreddits.value = c.subreddits?.length ? [...c.subreddits] : c.subreddit ? [c.subreddit] : []; allMedia.value = c.all_media; showTitles.value = c.show_titles ?? true; mode.value = c.mode ?? 'download'; batchSize.value = c.batch_size ?? 30 }
async function run(task: () => Promise<void>) { if (busy.value) return; busy.value = true; error.value = ''; try { await task() } catch (e) { error.value = String(e) } finally { busy.value = false } }
async function save() { if (!Number.isInteger(batchSize.value) || batchSize.value < 1 || batchSize.value > 50) throw new Error('불러올 개수는 1~50 사이 정수로 입력하세요.'); await redditRequest('status', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ enabled: enabled.value, subreddit: subreddits.value.includes(subreddit.value) ? subreddit.value : subreddits.value[0] || '', subreddits: subreddits.value, all_media: allMedia.value, show_titles: showTitles.value, mode: mode.value, redgifs_original: redgifsOriginal.value, fresh_list: freshList.value, batch_size: batchSize.value, request_interval: redditStatus.value?.config.request_interval ?? 3 }) }); await load() }
async function upload(event: Event) {
  const input = event.target as HTMLInputElement, file = input.files?.[0]
  if (!file) return
  await run(async () => { if (file.size > 1024 * 1024) throw new Error('쿠키 파일은 최대 1MB입니다.'); await redditRequest('cookies', { method: 'POST', body: file }); await loadReddit() }); input.value = ''
}
onMounted(() => { void run(async () => { await load(); void refreshRedditSubscribers().catch(() => {}) }); timer = setInterval(() => { void loadReddit().catch(() => {}) }, 2000) })
onUnmounted(() => clearInterval(timer))
</script>
<template>
  <section class="reddit-settings">
    <h3>Reddit · 테스트</h3>
    <p class="auth-help">불러오기 실패: 썸네일의 ↻ 또는 뷰어의 다시 불러오기로 원본 주소를 갱신합니다. 상단에서 실패한 항목을 최대 50개씩 순차 재시도합니다. 차단·요청 제한 시 중단합니다. 저장했던 파일이 없는 경우만 다시 받고, 존재하는 파일은 덮어쓰지 않습니다.</p>
    <p class="auth-help">기본 꺼짐. 공식 gallery-dl 실행 파일 설치와 Reddit 쿠키 업로드 후 사용할 수 있습니다.</p>
    <div class="reddit-install"><span>gallery-dl {{ redditStatus?.version || '미설치' }}</span><UButton variant="soft" :loading="redditStatus?.installing" :disabled="busy || redditStatus?.busy" @click="run(async () => { await redditRequest('install', { method: 'POST' }); await loadReddit() })">{{ redditStatus?.installed ? '실행 파일 업데이트' : '실행 파일 설치' }}</UButton></div>
    <p class="auth-help">공식 gdl-org/builds 릴리스에서 현재 서버용 실행 파일을 받고 SHA256을 확인합니다. 현재 x86_64 Linux·Windows 지원.</p>
    <label>Reddit 쿠키 (.txt)<input type="file" accept=".txt,text/plain" :disabled="busy || redditStatus?.busy" @change="upload"></label>
    <div class="reddit-install"><span>{{ redditStatus?.cookies ? 'Reddit 쿠키 등록됨' : '쿠키 없음' }}</span><UButton v-if="redditStatus?.cookies" color="neutral" variant="ghost" :disabled="busy || redditStatus?.busy" @click="run(async () => { await redditRequest('cookies', { method: 'DELETE' }); await load() })">쿠키 삭제 · 기능 끄기</UButton></div>
    <RedditSubreddits v-model="subreddits" :disabled="busy || redditStatus?.busy" />
    <div class="reddit-install"><span class="auth-help">구독자 수는 최초·누락 시 조회, 이후 1주일이 지난 선택 항목을 갱신합니다.</span><UButton variant="soft" color="neutral" :loading="redditStatus?.subscribers_refreshing" :disabled="busy || redditStatus?.installing" @click="run(() => refreshRedditSubscribers(true))">구독자 수 갱신</UButton></div>
    <p v-if="redditStatus?.subscribers_message" class="auth-help" role="status">{{ redditStatus.subscribers_message }}</p>
    <p class="auth-help">저장: data/library/reddit/서브레딧명 · 전용 DB: data/reddit.sqlite3</p>
    <p class="auth-help">주소 뒤 정렬 조건은 무시하고 기본 목록으로 받습니다. 받은 항목은 게시 시간 기준 최신순으로 표시합니다.</p>
    <label>받을 미디어<USelect v-model="allMedia" :items="[{ label: '이미지만', value: false }, { label: '이미지 + GIF + 동영상', value: true }]" class="w-full" :disabled="redditStatus?.busy" /></label>
    <label>한 번에 불러올 개수<UInputNumber v-model="batchSize" :min="1" :max="50" :step="1" :disabled="busy || redditStatus?.busy" /></label>
    <label>이용 방식<USelect v-model="mode" :items="[{ label: '서버에 영구 저장', value: 'download' }, { label: '온라인 연결 · URL 직접 열람', value: 'online' }]" class="w-full" :disabled="busy || redditStatus?.busy" /></label>
    <p v-if="mode === 'online'" class="auth-help">프록시를 켜면 썸네일·이미지·영상을 VPN으로 중계하며, 끄면 브라우저에서 원격 URL로 직접 엽니다. 서버에는 주소와 상태만 저장하며 다운로드 버튼을 누를 때만 파일을 저장합니다. 일부 외부 영상이나 음성은 직접 재생이 제한될 수 있습니다.</p>
    <label>목록 방식 · 테스트<USelect v-model="freshList" :items="[{label:'새 방식 · 3시간 이내 DB 목록 재사용',value:true},{label:'이전 방식 · 저장된 목록과 이어받기',value:false}]" :disabled="busy || redditStatus?.busy" /></label>
    <p class="auth-help">새 방식은 마지막 성공 갱신 후 3시간 이내에는 DB 목록을 복원하고, 3시간이 지나면 접속할 때 새로 조회합니다. 수동 목록 새로 확인은 즉시 갱신합니다.</p>
    <p class="auth-help">뷰어로 본 항목은 회색 배경의 체크 2개, 이전에 갤러리에만 노출된 항목은 회색 배경의 체크 1개로 구분합니다. 이전에 갤러리에 노출됐거나 뷰어로 본 항목은 썸네일 불투명도를 65%로 표시합니다. 이번에 처음 노출된 기록은 목록을 완전히 새로 조회할 때부터 불투명도에 반영하며, 아래로 추가 로딩하거나 상태를 갱신할 때는 반영하지 않습니다. NEW 표시는 사용하지 않습니다.</p>
    <label>영상 소스 · 테스트<USelect v-model="redgifsOriginal" :items="[{label:'기존 방식 · Reddit 미리보기 우선',value:false},{label:'RedGIFs 원본 우선 · 테스트',value:true}]" :disabled="busy || redditStatus?.busy" /></label>
    <p class="auth-help">원본 영상 주소는 DB에 저장해 만료 시간 없이 우선 사용합니다. 재생에 실패하면 다시 조회해 갱신합니다. 원본 영상은 프록시 사용 여부와 무관하게 서버가 저장 없이 중계하며, 지정한 VPN 프록시 정책을 따릅니다.</p>
    <label class="reddit-toggle"><USwitch v-model="showTitles" :disabled="busy" />갤러리에 포스트 제목 표시</label>
    <label class="reddit-toggle"><USwitch v-model="enabled" :disabled="busy" />Reddit 사용</label>
    <UButton :loading="busy" @click="run(save)">Reddit 설정 저장</UButton>
    <p v-if="error" role="alert">{{ error }}</p><p v-if="redditStatus?.message" role="status">{{ redditStatus.message }}</p>
    <p class="auth-help">쿠키 값은 표시하거나 내보내지 않습니다. 비활성화하면 추가 요청을 중단하고 받은 파일은 보존합니다.</p>
  </section>
</template>
<style scoped>
.reddit-settings{display:grid;gap:14px;margin-top:0;padding-top:0}.reddit-settings h3{margin:0}.reddit-settings label{display:grid;gap:8px}.reddit-install{display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap}.reddit-settings .reddit-toggle{display:flex;align-items:center;gap:10px}.reddit-settings p{overflow-wrap:anywhere}
</style>
