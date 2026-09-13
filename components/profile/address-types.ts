export type SavedAddress = {
  id: string;
  label: string | null;
  governorate: string;
  city: string | null;
  area: string | null;
  street: string;
  building: string | null;
  floor: string | null;
  apartment: string | null;
  notes: string | null;
  phone: string;
  isDefault: boolean;
};

export type AddressFormValues = {
  label: string;
  governorate: string;
  city: string;
  area: string;
  street: string;
  notes: string;
  phone: string;
  isDefault: boolean;
};

export const emptyAddressForm: AddressFormValues = {
  label: "",
  governorate: "",
  city: "",
  area: "",
  street: "",
  notes: "",
  phone: "",
  isDefault: false,
};
