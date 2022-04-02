// Copyright Deno Land Inc. All Rights Reserved. Proprietary and confidential.
/// <reference no-default-lib="true"/>

declare interface FetchEvent extends Event {
  request: Request;
  respondWith(response: Response | Promise<Response>): void;
}

declare var FetchEvent: {
  prototype: FetchEvent;
};

// declare function addEventListener(
//   type: "fetch",
//   handler: (this: Window, ev: FetchEvent) => any,
//   options?: boolean | AddEventListenerOptions,
// ): void;

interface WindowEventMap {
  "fetch": FetchEvent;
}
