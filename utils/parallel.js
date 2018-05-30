const chunk = require('lodash.chunk')

const parallel = async (promises, limit) => {
  let count = 0

  let chunked = chunk(promises, limit)

  const rec = async _promises => {
    await Promise.all(_promises.map(f => f()))
    count += 1
    if (count === chunked.length) return
    else await rec(chunked[count])
  }

  await rec(chunked[count])
}

module.exports = parallel