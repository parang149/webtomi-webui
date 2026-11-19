<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue'
import RedditSubreddits from './RedditSubreddits.vue'
import { loadReddit, redditStatus, redditRequest, refreshRedditSubscribers } from './reddit-client'
const showTitles = ref(true)
const subreddits = ref<string[]>([])
const enabled = ref(false), subreddit = ref(''), allMedia = ref(false), busy = ref(false), error = ref('')
let timer: ReturnType<typeof setInterval> | undefined
async function load() { await loadReddit(); const c = redditStatus.value!.config; enabled.value = c.enabled; subreddit.value = c.subreddit; subreddits.value = c.subreddits?.length ? [...c.subreddits] : c.subreddit ? [c.subreddit] : []; allMedia.value = c.all_media; showTitles.value = c.show_titles ?? true }
async function run(task: () => Promise<void>) { if (busy.value) return; busy.value = true; error.value = ''; try { await task() } catch (e) { error.value = String(e) } finally { busy.value = false } }
async function save() { await redditRequest('status', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ enabled: enabled.value, subreddit: subreddits.value.includes(subreddit.value) ? subreddit.value : subreddits.value[0] || '', subreddits: subreddits.value, all_media: allMedia.value, show_titles: showTitles.value }) }); await load() }
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
