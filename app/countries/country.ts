export type Country = Readonly<{
  code: string;
  name: string;
  capital: string;
  factSnippet: string;
  flagImageUrl: string;
  likes: number;
  dislikes: number;
}>;
