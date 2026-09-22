import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../modules/users/user.model.js", () => ({
  default: { find: vi.fn() },
}));

import User from "../modules/users/user.model.js";
import { searchUsers } from "../modules/site/tenant/siteUser.controller.js";

function mockRes() {
  const res = {};
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  return res;
}

function chainFind(leanResult) {
  return {
    select: vi.fn().mockReturnValue({
      populate: vi.fn().mockReturnValue({
        sort: vi.fn().mockReturnValue({
          limit: vi.fn().mockReturnValue({
            lean: vi.fn().mockResolvedValue(leanResult),
          }),
        }),
      }),
    }),
  };
}

describe("searchUsers controller", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("searches name and email with a regex filter and caps the limit", async () => {
    User.find.mockReturnValue(chainFind([{ _id: "u1", name: "Ali" }]));
    const res = mockRes();

    await searchUsers({ query: { search: "ali", limit: "50" } }, res, vi.fn());

    expect(User.find).toHaveBeenCalledWith({
      $or: [
        { name: { $regex: "ali", $options: "i" } },
        { email: { $regex: "ali", $options: "i" } },
      ],
    });
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ success: true }),
    );
    expect(res.json.mock.calls[0][0].data.users).toHaveLength(1);
  });

  it("returns the latest users when no search term is given", async () => {
    User.find.mockReturnValue(chainFind([]));
    const res = mockRes();

    await searchUsers({ query: {} }, res, vi.fn());

    expect(User.find).toHaveBeenCalledWith({});
  });
});
