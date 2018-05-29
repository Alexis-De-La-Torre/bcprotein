const { get } = require('axios')
const { load } = require('cheerio')
const parallel = require('./parallel')
const { fromString: html_to_text } = require('html-to-text')

const host = 'https://www.splanet.com.mx'

const get_categories = async () => {
  let html
  html = await get(host)
  html = html.data

  const $ = load(html)

  const selector = $('ul.ty-menu__items > li')
  
  let categories = []

  selector.each(function () {
    const has_subitems = $(this).find('.ty-menu__submenu').length > 0

    if (!has_subitems) {
      const name = $(this).text().trim()

      let id
      id = $(this).find('a').attr('href')
      if (id) id = id
        .replace(`${host}/tienda/`, '')
        .replace(/\/$/, '')

      categories.push({ name, id, sub_categories: [{ name, id }] })
      return
    }

    const name = $(this).find('a.ty-menu__item-link').text().trim()

    const id = $(this)
      .find('a.ty-menu__item-link')
      .attr('href')
      .replace(`${host}/tienda/`, '')
      .replace(/\/$/, '')

    let sub_categories = []

    $(this).find('a.ty-menu__submenu-link').each(function () {
      const name = $(this).text().trim()

      const id = $(this)
        .attr('href')
        .replace(`${host}/tienda/`, '')
        .replace(/\/$/, '')

      sub_categories.push({ name, id })
    })

    categories.push({ name, id, sub_categories })
  })

  // the first is not a category
  categories = categories.slice(1)

  categories = categories.map(c => c.sub_categories.map(s => ({ name: `${c.name} -> ${s.name}`, id: s.id })))

  categories = [].concat.apply([], categories) //flatten

  return categories
}

const get_items = async id => {
  const link = [
    host,
    '/tienda',
    `/${id}`,
    `/page-1`,
    `/?sort_by=product`,
    '&sort_order=asc',
    '&layout=short_list',
    `&items_per_page=100`,
  ].join('')

  let html
  html = await get(link)
  html = html.data

  const $ = load(html)

  let items = []

  $('.ty-compact-list__item').each(function () {
    const name = $(this).find('a.product-title').text()
    const id = $(this).find('.ty-sku-item span').text()
    const link = $(this).find('a.product-title').attr('href')
    items.push({ name, id, link })
  })

  // items = [items[1]]

  return items
}

const run = async category => {
  const items = await get_items(category.id)
  console.log(items)
}

(async () => {
  // const categories = await get_categories()

  const categories = [{
    name: 'POST-ENTRENOS -> GLUTAMINA',
    id: 'post-entrenamiento/glutamina'
  }]

  parallel(categories.map(cat => () => run(cat)), 1)
})()