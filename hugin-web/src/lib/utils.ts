import { createCn } from 'cn/config'

// The theme's own type steps (styles/index.css). Unregistered, cn reads text-small, text-body-sm
// and text-headline as text colours, so one of them and a real colour drop each other.
export const cn = createCn({
  extend: { classGroups: { 'font-size': [{ text: ['small', 'body-sm', 'headline'] }] } },
})
