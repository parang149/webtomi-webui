// Work-type and tag tones, registered as Nuxt UI colors in vite.config.ts.
// Hitomi uses lowercase type names; E-Hentai category names follow the site's own colors.
const kinds: Record<string, 'doujinshi' | 'manga' | 'artistcg' | 'gamecg' | 'anime' | 'ehDoujinshi' | 'ehManga' | 'ehArtistcg' | 'ehGamecg' | 'ehWestern' | 'ehNonh' | 'ehImageset' | 'ehCosplay' | 'ehAsianporn'> = {
  doujinshi: 'doujinshi', manga: 'manga', artistcg: 'artistcg', gamecg: 'gamecg', anime: 'anime',
  'Doujinshi': 'ehDoujinshi', 'Manga': 'ehManga', 'Artist CG': 'ehArtistcg', 'Game CG': 'ehGamecg', 'Western': 'ehWestern',
  'Non-H': 'ehNonh', 'Image Set': 'ehImageset', 'Cosplay': 'ehCosplay', 'Asian Porn': 'ehAsianporn',
}
export const kindColor = (kind?: string | null) => kinds[kind ?? ''] ?? 'neutral'
export const tagColor = (tone?: string) => tone === 'female' || tone === 'male' ? tone : 'neutral'
