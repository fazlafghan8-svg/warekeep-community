import React from 'react';
type IconProps = React.SVGProps<SVGSVGElement>;
const base = (props: IconProps): IconProps => ({
    xmlns: 'http://www.w3.org/2000/svg',
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 2,
    strokeLinecap: 'round',
    strokeLinejoin: 'round',
    'aria-hidden': true,
    ...props,
});
export const PlusIcon = (props: IconProps) => (<svg {...base(props)}><path d="M12 5v14M5 12h14"/></svg>);
export const DownloadIcon = (props: IconProps) => (<svg {...base(props)}><path d="M12 3v12m0 0l-4-4m4 4l4-4M4 17v2a2 2 0 002 2h12a2 2 0 002-2v-2"/></svg>);
export const SearchIcon = (props: IconProps) => (<svg {...base(props)}><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>);
export const PaperclipIcon = (props: IconProps) => (<svg {...base(props)}><path d="M21.44 11.05 12.25 20.24a6 6 0 0 1-8.49-8.49l8.57-8.57a4 4 0 1 1 5.66 5.66l-8.59 8.57a2 2 0 0 1-2.83-2.83l8.49-8.48"/></svg>);
export const NoteIcon = (props: IconProps) => (<svg {...base(props)}><path d="M12 20h9M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>);
export const RepeatIcon = (props: IconProps) => (<svg {...base(props)}><path d="m17 2 4 4-4 4"/><path d="M3 11v-1a4 4 0 0 1 4-4h14"/><path d="m7 22-4-4 4-4"/><path d="M21 13v1a4 4 0 0 1-4 4H3"/></svg>);
export const DotsIcon = (props: IconProps) => (<svg {...base(props)}><circle cx="12" cy="5" r="1.4" fill="currentColor" stroke="none"/><circle cx="12" cy="12" r="1.4" fill="currentColor" stroke="none"/><circle cx="12" cy="19" r="1.4" fill="currentColor" stroke="none"/></svg>);
export const CheckIcon = (props: IconProps) => (<svg {...base(props)}><path d="M5 13l4 4L19 7"/></svg>);
export const ChevronDownIcon = (props: IconProps) => (<svg {...base(props)}><path d="m6 9 6 6 6-6"/></svg>);
export const XIcon = (props: IconProps) => (<svg {...base(props)}><path d="M6 18 18 6M6 6l12 12"/></svg>);
export const TrashIcon = (props: IconProps) => (<svg {...base(props)}><path d="M3 6h18M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2m3 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/></svg>);
export const PencilIcon = (props: IconProps) => (<svg {...base(props)}><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/></svg>);
export const SortIcon = (props: IconProps) => (<svg {...base(props)}><path d="m8 9 4-4 4 4M8 15l4 4 4-4"/></svg>);
export const RowsIcon = (props: IconProps) => (<svg {...base(props)}><rect x="3" y="4" width="18" height="4" rx="1"/><rect x="3" y="10" width="18" height="4" rx="1"/><rect x="3" y="16" width="18" height="4" rx="1"/></svg>);
export const ReceiptIcon = (props: IconProps) => (<svg {...base(props)}><path d="M4 3h16v18l-2.5-1.5L15 21l-2.5-1.5L10 21l-2.5-1.5L5 21l-1-.6Z"/><path d="M8 8h8M8 12h8M8 16h5"/></svg>);
/* Category icons */
export const UtensilsIcon = (props: IconProps) => (<svg {...base(props)}><path d="M3 2v7c0 1.1.9 2 2 2h4a2 2 0 0 0 2-2V2"/><path d="M7 2v20"/><path d="M21 15V2a5 5 0 0 0-5 5v6c0 1.1.9 2 2 2h3Zm0 0v7"/></svg>);
export const NaanIcon = (props: IconProps) => (<svg {...base(props)}><ellipse cx="12" cy="12" rx="8.5" ry="5.5"/><path d="M9.5 10l-1.5 4M13 10l-1.5 4M16.5 10l-1.5 4"/></svg>);
export const TeaIcon = (props: IconProps) => (<svg {...base(props)}><path d="M17 8h1a4 4 0 1 1 0 8h-1"/><path d="M3 8h14v9a4 4 0 0 1-4 4H7a4 4 0 0 1-4-4z"/><path d="M6 2v2M10 2v2M14 2v2"/></svg>);
export const BoltIcon = (props: IconProps) => (<svg {...base(props)}><path d="M13 2 3 14h9l-1 8 10-12h-9l1-8z"/></svg>);
export const DropletIcon = (props: IconProps) => (<svg {...base(props)}><path d="M12 2.69l5.66 5.66a8 8 0 1 1-11.31 0z"/></svg>);
export const HomeIcon = (props: IconProps) => (<svg {...base(props)}><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><path d="M9 22V12h6v10"/></svg>);
export const BanknoteIcon = (props: IconProps) => (<svg {...base(props)}><rect x="2" y="6" width="20" height="12" rx="2"/><circle cx="12" cy="12" r="2.5"/><path d="M5.5 12h.01M18.5 12h.01"/></svg>);
export const TruckIcon = (props: IconProps) => (<svg {...base(props)}><path d="M14 18V6a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v11a1 1 0 0 0 1 1h2"/><path d="M15 18H9"/><path d="M19 18h2a1 1 0 0 0 1-1v-3.65a1 1 0 0 0-.22-.62l-3.48-4.35A1 1 0 0 0 17.52 8H14"/><circle cx="7" cy="18" r="2"/><circle cx="17" cy="18" r="2"/></svg>);
export const FuelIcon = (props: IconProps) => (<svg {...base(props)}><path d="M3 22h12"/><path d="M14 22V4a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v18"/><path d="M4 10h10"/><path d="M14 13h1a3 3 0 0 1 3 3v1a2 2 0 0 0 4 0V9.83a2 2 0 0 0-.59-1.42L19 6"/></svg>);
export const WifiIcon = (props: IconProps) => (<svg {...base(props)}><path d="M2 8.82a15 15 0 0 1 20 0"/><path d="M5 12.86a10 10 0 0 1 14 0"/><path d="M8.5 16.43a5 5 0 0 1 7 0"/><path d="M12 20h.01"/></svg>);
export const PhoneIcon = (props: IconProps) => (<svg {...base(props)}><rect x="7" y="2" width="10" height="20" rx="2"/><path d="M12 18h.01"/></svg>);
export const WrenchIcon = (props: IconProps) => (<svg {...base(props)}><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/></svg>);
export const CartIcon = (props: IconProps) => (<svg {...base(props)}><circle cx="8" cy="21" r="1"/><circle cx="19" cy="21" r="1"/><path d="M2.05 2.05h2l2.66 12.42a2 2 0 0 0 2 1.58h9.78a2 2 0 0 0 1.95-1.57l1.65-7.43H5.12"/></svg>);
export const TagIcon = (props: IconProps) => (<svg {...base(props)}><path d="M12.586 2.586A2 2 0 0 0 11.172 2H4a2 2 0 0 0-2 2v7.172a2 2 0 0 0 .586 1.414l8.704 8.704a2.426 2.426 0 0 0 3.42 0l6.58-6.58a2.426 2.426 0 0 0 0-3.42z"/><path d="M7.5 7.5h.01"/></svg>);
