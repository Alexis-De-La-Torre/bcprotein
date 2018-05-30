const price = input => {
  const { price } = input
  const { shipping } = input
  const { expectedProfit } = input
  const { commision } = input
  const { discount } = input
  const { tax } = input
  const { less_than_550 } = input
  const { more_than_550 } = input
  const { me } = input

  const en_1 = me ? shipping * (1 - less_than_550) : shipping
  const en_2 = me ? shipping * (1 - more_than_550) : shipping

  // Precio de Compra = ( Precio Anunciado - Descuento de Proveedor ) + IVA
  const pc = price * (1 - discount) * (1 + tax)

  // Precio de Venta = ( Precio de Compra * Margen de Ganancia Deseado + Envio ) / Comision
  const pv = (pc * (1 + expectedProfit) + shipping) / (1 - commision)

  const pv_1 = (pc * (1 + expectedProfit) + en_1) / (1 - commision)
  const pv_2 = (pc * (1 + expectedProfit) + en_2) / (1 - commision)

  const pv_aj = pv_1 < 550 ? pv_1 : pv_2

  // Comision de Mercado Libre
  const ml = pv_aj * commision

  // Ganancia Bruta = Precio de Venta - Precio de compra
  const gb = pv_aj - pc

  // Ganancia Neta = Ganancia Bruta - Comision de Mercado Libre
  const gn = gb - ml - (pv_aj < 550 ? en_1 : en_2)

  // Porcentaje de Ganancia
  const pg = gn / pc

  return parseFloat(pv_aj.toFixed(2))
}

module.exports = price
