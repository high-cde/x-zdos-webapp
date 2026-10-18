import { recordOnChain } from "../services/chainAdapter.js";

export async function onBusinessEvent(type, data) {
  return recordOnChain(type, data);
}
