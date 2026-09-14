import { describe, it, expect } from "vitest";
import { isE2eUploadFolder, testUploadFolderAllowed } from "./test-upload-folder";

describe("isE2eUploadFolder", () => {
  it("matches the exact e2e folder shape", () => {
    expect(isE2eUploadFolder("nile-kings/products/e2e-1234-assign")).toBe(true);
    expect(isE2eUploadFolder("nile-kings/products/e2e-abc")).toBe(true);
  });

  it("rejects anything else, including the real products folder and near-misses", () => {
    expect(isE2eUploadFolder("nile-kings/products")).toBe(false);
    expect(isE2eUploadFolder("nile-kings/products/e2e")).toBe(false);
    expect(isE2eUploadFolder("nile-kings/products/real-folder")).toBe(false);
    expect(isE2eUploadFolder("nile-kings/routed-proofs")).toBe(false);
    expect(isE2eUploadFolder("../nile-kings/products/e2e-x")).toBe(false);
  });
});

describe("testUploadFolderAllowed", () => {
  it("refuses when the flag is unset, regardless of NODE_ENV", () => {
    expect(testUploadFolderAllowed({ NODE_ENV: "development" })).toBe(false);
    expect(testUploadFolderAllowed({ NODE_ENV: "test" })).toBe(false);
    expect(testUploadFolderAllowed({ NODE_ENV: "development", ALLOW_TEST_UPLOAD_FOLDER: undefined })).toBe(false);
  });

  it("refuses in production even if the flag is somehow set", () => {
    expect(testUploadFolderAllowed({ NODE_ENV: "production", ALLOW_TEST_UPLOAD_FOLDER: "1" })).toBe(false);
  });

  it("refuses when the flag has any value other than exactly \"1\"", () => {
    expect(testUploadFolderAllowed({ NODE_ENV: "development", ALLOW_TEST_UPLOAD_FOLDER: "true" })).toBe(false);
    expect(testUploadFolderAllowed({ NODE_ENV: "development", ALLOW_TEST_UPLOAD_FOLDER: "" })).toBe(false);
  });

  it("allows only non-production + the exact flag", () => {
    expect(testUploadFolderAllowed({ NODE_ENV: "development", ALLOW_TEST_UPLOAD_FOLDER: "1" })).toBe(true);
    expect(testUploadFolderAllowed({ NODE_ENV: "test", ALLOW_TEST_UPLOAD_FOLDER: "1" })).toBe(true);
  });
});
