"use strict";

const { defaultPageLimit } = require("../consts/consts.js");

function paginate(list, page, pageLimit) {
    let limit = pageLimit || defaultPageLimit;
    return list.slice((page - 1) * limit, page * limit);
}

module.exports = paginate;