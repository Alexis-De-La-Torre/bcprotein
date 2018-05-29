const { get } = require('axios')
const { load } = require('cheerio')
const parallel = require('./parallel')
const { fromString: html_to_text } = require('html-to-text')
const serial = require('promise-serial')
const sample = require('lodash.samplesize')

const dev = process.env.NODE_ENV !== 'production'

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

const get_item = async link => {
  let html
  html = await get(link)
  html = html.data

  const elm = load(html)('.main-content-grid')

  let price
  price = elm.find('.ty-price-num').text().replace('$', '')
  price = parseFloat(price)

  let inventory
  inventory = elm.find('.ty-qty-in-stock').text() === 'En stock' ? 5 : 0

  let description
  description = elm.find('#content_description').html()
  description = html_to_text(description, { ignoreImage: true, preserveNewlines: true })

  let brand = elm.find('.ty-product-feature__value').text()

  let image = elm.find('a.cm-image-previewer').attr('href')

  return { price, inventory, description, brand, image }
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
    `&items_per_page=1000`,
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

  if (dev) items = sample(items)

  items = items.map(({ name, id, link }) => async () => {
    const item = await get_item(link)
    console.log(`[${id}] ${name}`)
    return { name, id, ...item, link }
  })

  items = serial(items, { parallelize: 10 })

  return items
}

const run = async category => {
  const items = await get_items(category.id)
  console.log(items)
}

(async () => {
  let categories
  categories = await get_categories()
  if (dev) categories = sample(categories)

  parallel(categories.map(cat => () => run(cat)), 1)
})()