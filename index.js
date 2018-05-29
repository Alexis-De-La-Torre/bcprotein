const { get } = require('axios')
const { load } = require('cheerio')
const parallel = require('./parallel')
const { fromString: html_to_text } = require('html-to-text')
const serial = require('promise-serial')
const sample = require('lodash.samplesize')
const log_update = require('log-update')
const { Client: _pg } = require('pg')

const dev = process.env.NODE_ENV !== 'production'

const host = 'https://www.splanet.com.mx'

let total_categories
let total_items
let count_categories = 0
let count_items = 0
let percent = 0

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

const run = async (pg, category) => {
  const log = name => {
    count_items +=1

    const render_percent = () => (percent * 100).toFixed(2) + '%'

    const render_progress_bar = () => {
      const length = 20
      const clamped = Math.ceil(percent * length)
      let render = ''
      for (let i = 0; i < length; i++) {
        if (i <= clamped) render += '='
        else render += ' '
      }
      return render
    }

    const categories_p = `categories: ${count_categories}/${total_categories}`
    const items_p = `items: ${count_items}/${total_items}`

    percent += 1 / total_categories / total_items

    const message = [
      `[${render_percent()}]`,
      `[${categories_p}] ${category.name}`,
      `[${items_p}] ${name}`,
    ].join(' ')

    console.log(message)
    console.log()
  }

  const link = [
    host,
    '/tienda',
    `/${category.id}`,
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

  if (dev) items = sample(items, 3)

  count_items = 0
  total_items = items.length

  items = items.map(({ name, id, link }) => async () => {
    let item
    item = await get_item(link)
    item = { name, id, ...item, link }

    const query = 'insert into items values ($1, $2, $3, $4, $5, $6, $7, $8, $9)'

    const values = [
      item.id,
      item.name,
      category.name,
      item.price,
      item.inventory,
      item.description,
      item.brand,
      item.image,
      item.link,
    ]

    if (!dev) await pg.query(query, values)
    else console.log(query, values)

    log(name)
  })

  await serial(items, { parallelize: 5 })

  count_categories += 1
}

(async () => {
  const pg = new _pg()
  await pg.connect()

  const create_q = `
    create table if not exists items (
      id text,
      name text,
      category text,
      price numeric,
      inventory int, 
      description text,
      brand text,
      image text,
      link text
    )
  `

  await pg.query(create_q)

  const delete_q = 'delete from items'
  if (!dev) await pg.query(delete_q)
  else console.log(delete_q)

  let categories
  categories = await get_categories()
  if (dev) categories = sample(categories, 1)

  total_categories = categories.length

  parallel(categories.map(cat => () => run(pg, cat)), 1)

  // await pg.end()
})()