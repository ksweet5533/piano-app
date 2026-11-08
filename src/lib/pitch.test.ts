import { describe, expect, it } from "vitest";
import { heard, ROOMS } from "./micRooms";

describe("the mic listener in simulated rooms", () => {
  for (const room of ROOMS) it(room.name, () => expect(heard(room)).toEqual(room.expected));
});
