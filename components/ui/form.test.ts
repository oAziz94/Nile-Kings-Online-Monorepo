import { describe, expect, it } from "vitest";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";

// Phase 3.3: proves the react-hook-form + zodResolver wiring components/ui/form.tsx
// depends on actually works end-to-end, ahead of any screen (Phase 4) using it for real.
describe("react-hook-form zodResolver wiring", () => {
  const schema = z.object({
    phone: z.string().min(1, "رقم الجوال مطلوب"),
    password: z.string().min(8, "كلمة المرور يجب أن تكون 8 أحرف على الأقل"),
  });
  const resolver = zodResolver(schema);
  const resolverOptions = { fields: {}, shouldUseNativeValidation: false } as const;

  it("surfaces the schema's own Arabic messages as field errors", async () => {
    const result = await resolver({ phone: "", password: "short" }, undefined, resolverOptions);
    expect(result.errors.phone?.message).toBe("رقم الجوال مطلوب");
    expect(result.errors.password?.message).toBe("كلمة المرور يجب أن تكون 8 أحرف على الأقل");
  });

  it("returns no errors and the parsed values for valid input", async () => {
    const result = await resolver({ phone: "01012345678", password: "longenough" }, undefined, resolverOptions);
    expect(result.errors).toEqual({});
    expect(result.values).toEqual({ phone: "01012345678", password: "longenough" });
  });
});
