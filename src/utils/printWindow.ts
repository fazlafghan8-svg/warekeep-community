/** Keep a handle for writing our document while severing the child's opener. */
export const openPrintWindow = (features: string): Window | null => {
    const printWindow = window.open('', '_blank', features);
    if (printWindow)
        printWindow.opener = null;
    return printWindow;
};
