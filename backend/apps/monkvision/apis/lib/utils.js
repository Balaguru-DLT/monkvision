/**
 * utils.js - Utility functions
 * 
 * (C) 2020 TekMonks. All rights reserved.
 */

const db = require(`${APP_CONSTANTS.LIB_DIR}/db.js`);

/**
 * Returns SQLite date from ISO date
 * @param {string} date Date in ISO format
 */
exports.fromISOToSQLite = date => new Date(date).toISOString().split("T").join(" ").slice(0, -1);

/**
 * Returns UTC or local time from SQLite UTC time string
 * @param {string} sqliteDate The incoming date from SQLite
 * @param {boolean} notUTC Set to true to convert to local time
 */
exports.fromSQLiteToUTCOrLocalTime = function(sqliteDate, notUTC) {
    const dateThisUTC = new Date(sqliteDate.split(" ").join("T")+"Z");
    const dateThisLocal = new Date(dateThisUTC.getTime()+dateThisUTC.getTimezoneOffset()*60*1000);
    const finalDate = exports.fromISOToSQLite(notUTC?dateThisLocal.toISOString():dateThisUTC.toISOString());
    return finalDate.substring(0, finalDate.lastIndexOf(".")!=-1?finalDate.lastIndexOf("."):finalDate.length);
}

 /**
  * Converts from ISO to SQLite time
  * @param {object} range Time range, {from: string in ISO time format, to: string in ISO time format}
  */
exports.getTimeRangeForSQLite = (range) => {
    return {from: exports.fromISOToSQLite(range.from), to: exports.fromISOToSQLite(range.to)}
}

/**
 * Fetches data from the database and caches it if necessary.
 * @param {string} queryFunc - The database query function name.
 * @param {string} id -  Log ID Unique identifier.
 * @param {Object} timeRange - Time range (optional).
 * @param {...any} extraParams - Additional parameters to pass to the query function.
 * @returns  Returns an array of fetched or cached data.
 */
const cache = {}; 

async function fetchAndCache(id, timeRange, queryFunc, ...extraParams) {
    const rows = await db[queryFunc](id, timeRange, ...extraParams);
    cache[id].data.push(...rows);
    return rows;
}

async function fetchIncrementalAndCache(id, range, queryFunc, prepend = false, ...extraParams) {
    const rows = await db[queryFunc](id, range, ...extraParams);
    if (prepend) cache[id].data.unshift(...rows);
    else cache[id].data.push(...rows);
    return rows;
}

exports.fetchDBData = async function (queryFunc, id, timeRange, ...extraParams) {
    if (!timeRange) return db[queryFunc](id, ...extraParams);
    if (!cache[id]) cache[id] = { data: [], lastRange: null };
    const { lastRange } = cache[id];

    if (!lastRange || (timeRange.from < lastRange.from && timeRange.to > lastRange.to) ) {
        cache[id].data = await fetchAndCache(id, timeRange, queryFunc, ...extraParams);
        cache[id].lastRange = { ...timeRange };
    } else if (timeRange.to > lastRange.to && timeRange.from === lastRange.from) {
        await fetchIncrementalAndCache(id, { from: lastRange.to, to: timeRange.to }, queryFunc, false, ...extraParams);
        cache[id].lastRange.to = timeRange.to;
    } else if (timeRange.from < lastRange.from && timeRange.to <= lastRange.to) {
        await fetchIncrementalAndCache(id, { from: timeRange.from, to: lastRange.from }, queryFunc, true, ...extraParams);
        cache[id].lastRange.from = timeRange.from;
    }else if (timeRange.from >= lastRange.from && timeRange.to <= lastRange.to) {
        return cache[id].data.filter(row => row.timestamp >= timeRange.from && row.timestamp <= timeRange.to);
    }

    return cache[id].data.filter(row => row.timestamp >= timeRange.from && row.timestamp <= timeRange.to);
};