import type { Country } from "./country";

const wikimediaFlagUrl = (fileName: string) =>
  `https://commons.wikimedia.org/wiki/Special:FilePath/${fileName}`;

export const countryFixtures = [
  {
    code: "US",
    name: "United States",
    capital: "Washington, D.C.",
    flagImageUrl: wikimediaFlagUrl("Flag%20of%20the%20United%20States.svg"),
    likes: 842,
    dislikes: 318,
  },
  {
    code: "CA",
    name: "Canada",
    capital: "Ottawa",
    flagImageUrl: wikimediaFlagUrl("Flag%20of%20Canada.svg"),
    likes: 731,
    dislikes: 112,
  },
  {
    code: "BR",
    name: "Brazil",
    capital: "Brasilia",
    flagImageUrl: wikimediaFlagUrl("Flag%20of%20Brazil.svg"),
    likes: 689,
    dislikes: 246,
  },
  {
    code: "JP",
    name: "Japan",
    capital: "Tokyo",
    flagImageUrl: wikimediaFlagUrl("Flag%20of%20Japan.svg"),
    likes: 917,
    dislikes: 87,
  },
  {
    code: "IN",
    name: "India",
    capital: "New Delhi",
    flagImageUrl: wikimediaFlagUrl("Flag%20of%20India.svg"),
    likes: 803,
    dislikes: 291,
  },
  {
    code: "ZA",
    name: "South Africa",
    capital: "Pretoria",
    flagImageUrl: wikimediaFlagUrl("Flag%20of%20South%20Africa.svg"),
    likes: 456,
    dislikes: 233,
  },
  {
    code: "DE",
    name: "Germany",
    capital: "Berlin",
    flagImageUrl: wikimediaFlagUrl("Flag%20of%20Germany.svg"),
    likes: 764,
    dislikes: 149,
  },
  {
    code: "FR",
    name: "France",
    capital: "Paris",
    flagImageUrl: wikimediaFlagUrl("Flag%20of%20France.svg"),
    likes: 592,
    dislikes: 305,
  },
  {
    code: "GB",
    name: "United Kingdom",
    capital: "London",
    flagImageUrl: wikimediaFlagUrl("Flag%20of%20the%20United%20Kingdom.svg"),
    likes: 618,
    dislikes: 276,
  },
  {
    code: "AU",
    name: "Australia",
    capital: "Canberra",
    flagImageUrl: wikimediaFlagUrl("Flag%20of%20Australia.svg"),
    likes: 704,
    dislikes: 134,
  },
  {
    code: "MX",
    name: "Mexico",
    capital: "Mexico City",
    flagImageUrl: wikimediaFlagUrl("Flag%20of%20Mexico.svg"),
    likes: 477,
    dislikes: 198,
  },
  {
    code: "EG",
    name: "Egypt",
    capital: "Cairo",
    flagImageUrl: wikimediaFlagUrl("Flag%20of%20Egypt.svg"),
    likes: 389,
    dislikes: 221,
  },
] as const satisfies readonly Country[];

