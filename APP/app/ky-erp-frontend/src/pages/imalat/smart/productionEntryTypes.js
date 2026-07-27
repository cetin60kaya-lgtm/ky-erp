/** @typedef {'ready'|'review'|'error'|'context'} ParseStatus */
/** @typedef {{id:string,date:string,modelId:string,modelName:string,ground:string,printRegion:string,quantity:number,shift:string,machineId:string,machineName:string,operatorId:string,operatorName:string,rawText:string,warnings:string[],confidence:number,status:ParseStatus,candidates?:Array}} ParsedProductionEntry */
export const PARSE_STATUS = { READY: "ready", REVIEW: "review", ERROR: "error", CONTEXT: "context" };
