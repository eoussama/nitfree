export { onEvent, sendMessage, sendTabMessage } from "./client";
export type { TEventName, TEvents, TProtocol, TRequest, TRequestName, TResponse, TTabProtocol } from "./protocol";
export { broadcast, handleMessages, handleTabMessages, type THandlers, type TTabHandlers } from "./server";
