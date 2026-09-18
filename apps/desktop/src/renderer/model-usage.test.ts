import assert from 'node:assert/strict';
import { test } from 'node:test';
import { costSummary, estimateCost, modelKey, parseRate, readModelRates, usageChartBins } from './model-usage.ts';
import { validateModelUsageReport } from '../validation.ts';

const usage = { input_tokens: 1_000_000, output_tokens: 200_000, reported_calls: 2, unreported_calls: 0 };
test('model rates distinguish missing, zero, invalid input and provider identity', () => {
  for (const v of ['', ' ', '-1', 'Infinity', 'NaN', '1e6', '1000001']) assert.equal(parseRate(v), null);
  assert.equal(parseRate('0'), 0); assert.equal(parseRate('0.25'), .25);
  assert.notEqual(modelKey('a:b','c'), modelKey('a','b:c'));
  assert.equal(estimateCost(usage, undefined), null);
  assert.equal(estimateCost(usage, { providerId:'a', modelId:'same', currency:'CNY', input:2, output:10 }),4);
  assert.equal(estimateCost(usage, { providerId:'a', modelId:'same', currency:'CNY', input:0, output:0 }),0);
  assert.deepEqual(readModelRates({getItem:()=> 'broken'}), []);
  assert.deepEqual(readModelRates({getItem:()=> JSON.stringify([{providerId:'a',modelId:'m',currency:'CNY',input:-1,output:2}])}), []);
});
test('cost summary never adds currencies or prices an unrelated same-name model', () => {
  const groups = ['a','b','c'].map(provider_config_id => ({provider_config_id, model_id:'same', usage}));
  const result=costSummary(groups,[{providerId:'a',modelId:'same',currency:'CNY',input:2,output:10},{providerId:'b',modelId:'same',currency:'USD',input:1,output:5}]);
  assert.deepEqual(result,{totals:{CNY:4,USD:2},unpriced:1});
});
test('chart includes idle days and bounds long histories without losing tokens', () => {
  const since=Date.parse('2026-09-01T00:00:00Z');
  const now=Date.parse('2026-09-07T13:00:00Z');
  const bins=usageChartBins([{date:'2026-09-03',usage}],since,now);
  assert.equal(bins.length,7); assert.equal(bins[0]!.usage.input_tokens,0); assert.equal(bins[2]!.usage.input_tokens,1_000_000);
  const old=usageChartBins([{date:'2020-01-01',usage},{date:'2026-09-03',usage}],null,now);
  assert.ok(old.length<=30); assert.equal(old.reduce((sum,b)=>sum+b.usage.input_tokens,0),2_000_000);
});
test('usage bridge rejects extra keys and unbounded pagination', () => {
  assert.deepEqual(validateModelUsageReport({since:null,offset:0,limit:20}),{since:null,offset:0,limit:20});
  for (const patch of [{since:-1},{since:'1'},{since:Infinity},{offset:-1},{offset:1.5},{limit:0},{limit:101},{credential:'no'}]) {
    assert.throws(()=>validateModelUsageReport({since:null,offset:0,limit:20,...patch}));
  }
});
