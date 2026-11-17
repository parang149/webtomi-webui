import descriptions from './tag-descriptions.ko.json'

type Tag = { tag: string; female?: number | string; male?: number | string }
const korean = new Map(Object.entries(descriptions))

export function tagClass(tag: Tag) {
  const explicit = tag.tag.trim().match(/^(female|male)\s*:/i)?.[1]?.toLowerCase()
  return explicit ?? (Number(tag.female) ? 'female' : Number(tag.male) ? 'male' : 'general')
}

export function tagKey(tag: Tag) {
  const name = tag.tag.normalize('NFKC').trim().toLowerCase().replace(/[_\s]+/g, ' ')
  const category = tagClass(tag)
  return category + ':' + name.replace(/^(female|male)\s*:\s*/, '')
}

export function tagDescription(tag: Tag) {
  return korean.get(tagKey(tag))
}
