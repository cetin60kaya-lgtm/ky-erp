import test from 'node:test';
import assert from 'node:assert/strict';
import { operatorForMachine } from './productionEntryParser.js';
test('a missing night operator never inherits the day operator',()=>{const machine={machineNo:'1',dayOperator:'Murat',nightOperator:''};assert.equal(operatorForMachine(machine,'Gece'),'');assert.equal(operatorForMachine(machine,'Gündüz'),'Murat');});
test('configured night operator is used independently',()=>{const machine={machineNo:'1',dayOperator:'Murat',nightOperator:'Ayşe'};assert.equal(operatorForMachine(machine,'Gece'),'Ayşe');});
