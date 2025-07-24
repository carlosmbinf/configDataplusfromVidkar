'use strict';

const Promise = require('bluebird').Promise;
const exec = require('child_process').exec;
const parseStats = require('./parser-link'); // el parser actual que tienes para ip -s link show
const parseAddresses = require('./parser-addr'); // parser adicional para ip addr show

function executeCommand(cmd) {
  return new Promise((resolve, reject) => {
    exec(cmd, (error, stdout, stderr) => {
      if (error) {
        reject(error);
      } else {
        resolve(stdout);
      }
    });
  });
}

function mergeInterfaces(statsData, addrData) {
  const result = {};

  const allDevices = new Set([
    ...Object.keys(statsData),
    ...Object.keys(addrData),
  ]);

  allDevices.forEach((device) => {
    result[device] = {
      device,
      inet: addrData[device]?.inet || null,
      inet6: addrData[device]?.inet6 || null,
      link: statsData[device]?.link || addrData[device]?.link || null,
      rx: statsData[device]?.rx || { packets: 0, bytes: 0 },
      tx: statsData[device]?.tx || { packets: 0, bytes: 0 },
      other: {},
    };
  });

  return result;
}

function executeIfconfig() {
  return Promise.all([
    executeCommand('ip addr show').then(parseAddresses),
    executeCommand('ip -s link show').then(parseStats),
  ]).then(([addrData, statsData]) => {
    return mergeInterfaces(statsData, addrData);
  });
}

module.exports = executeIfconfig;