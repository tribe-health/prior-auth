import { useState } from "react"
import { Bar, BarChart, CartesianGrid, XAxis } from "recharts"
import { FileTextIcon, PlusIcon, SearchIcon } from "lucide-react"
import type { PreviewFixture } from "./preview-types"
import { useHighlightedCode } from "@/hooks/use-highlighted-code"
import { StateChip } from "@/shared/ui/state-chip"
import * as Accordion from "@/components/ui/accordion"
import * as Alert from "@/components/ui/alert"
import * as AlertDialog from "@/components/ui/alert-dialog"
import * as AspectRatio from "@/components/ui/aspect-ratio"
import * as Attachment from "@/components/ui/attachment"
import * as Avatar from "@/components/ui/avatar"
import * as Badge from "@/components/ui/badge"
import * as Breadcrumb from "@/components/ui/breadcrumb"
import * as Bubble from "@/components/ui/bubble"
import * as Button from "@/components/ui/button"
import * as ButtonGroup from "@/components/ui/button-group"
import * as Calendar from "@/components/ui/calendar"
import * as Card from "@/components/ui/card"
import * as Carousel from "@/components/ui/carousel"
import * as Chart from "@/components/ui/chart"
import * as Checkbox from "@/components/ui/checkbox"
import * as CodeBlock from "@/components/ui/code-block"
import * as Collapsible from "@/components/ui/collapsible"
import * as Combobox from "@/components/ui/combobox"
import * as Command from "@/components/ui/command"
import * as ContextMenu from "@/components/ui/context-menu"
import * as Dialog from "@/components/ui/dialog"
import * as Direction from "@/components/ui/direction"
import * as Drawer from "@/components/ui/drawer"
import * as DropdownMenu from "@/components/ui/dropdown-menu"
import * as Empty from "@/components/ui/empty"
import * as Field from "@/components/ui/field"
import * as HoverCard from "@/components/ui/hover-card"
import * as Input from "@/components/ui/input"
import * as InputGroup from "@/components/ui/input-group"
import * as InputOtp from "@/components/ui/input-otp"
import * as Item from "@/components/ui/item"
import * as Kbd from "@/components/ui/kbd"
import * as Label from "@/components/ui/label"
import * as Marker from "@/components/ui/marker"
import * as Menubar from "@/components/ui/menubar"
import * as Message from "@/components/ui/message"
import * as MessageScroller from "@/components/ui/message-scroller"
import * as NativeSelect from "@/components/ui/native-select"
import * as NavigationMenu from "@/components/ui/navigation-menu"
import * as Pagination from "@/components/ui/pagination"
import * as Popover from "@/components/ui/popover"
import * as Progress from "@/components/ui/progress"
import * as Questionnaire from "@/components/ui/questionnaire"
import * as RadioGroup from "@/components/ui/radio-group"
import * as Resizable from "@/components/ui/resizable"
import * as ScrollArea from "@/components/ui/scroll-area"
import * as Select from "@/components/ui/select"
import * as Separator from "@/components/ui/separator"
import * as Sheet from "@/components/ui/sheet"
import * as Sidebar from "@/components/ui/sidebar"
import * as Skeleton from "@/components/ui/skeleton"
import * as Slider from "@/components/ui/slider"
import * as Spinner from "@/components/ui/spinner"
import * as Switch from "@/components/ui/switch"
import * as Table from "@/components/ui/table"
import * as Tabs from "@/components/ui/tabs"
import * as Textarea from "@/components/ui/textarea"
import * as Toast from "@/components/ui/toast"
import * as Toggle from "@/components/ui/toggle"
import * as ToggleGroup from "@/components/ui/toggle-group"
import * as Tooltip from "@/components/ui/tooltip"
import * as Trace from "@/components/ui/trace"

function Actions() {
  return <div className="preview-stack">
    <div className="preview-row">{(["default", "secondary", "outline", "ghost", "destructive", "link"] as const).map(variant => <Button.Button key={variant} variant={variant}>{variant}</Button.Button>)}</div>
    <div className="preview-row">{(["xs", "sm", "default", "lg"] as const).map(size => <Button.Button key={size} size={size}>{size}</Button.Button>)}<Button.Button disabled>Disabled</Button.Button>{(["icon-xs", "icon-sm", "icon", "icon-lg"] as const).map(size => <Button.Button key={size} size={size} aria-label={`Add fixture (${size})`}><PlusIcon /></Button.Button>)}</div>
    <div className="preview-row">{(["default", "secondary", "outline", "destructive", "ghost", "link"] as const).map(variant => <Badge.Badge key={variant} variant={variant}>{variant}</Badge.Badge>)}</div>
    <ButtonGroup.ButtonGroup><Button.Button variant="secondary">First</Button.Button><ButtonGroup.ButtonGroupSeparator /><Button.Button variant="secondary">Second</Button.Button><ButtonGroup.ButtonGroupText>2</ButtonGroup.ButtonGroupText></ButtonGroup.ButtonGroup>
    <div className="preview-row"><Toggle.Toggle aria-label="Pin fixture" defaultPressed>Pin</Toggle.Toggle><Toggle.Toggle variant="outline">Outline</Toggle.Toggle><Toggle.Toggle disabled>Disabled</Toggle.Toggle></div>
    <ToggleGroup.ToggleGroup defaultValue={["compact"]}><ToggleGroup.ToggleGroupItem value="compact">Compact</ToggleGroup.ToggleGroupItem><ToggleGroup.ToggleGroupItem value="wide">Wide</ToggleGroup.ToggleGroupItem></ToggleGroup.ToggleGroup>
    <p>Keyboard hint <Kbd.KbdGroup><Kbd.Kbd>⌘</Kbd.Kbd><Kbd.Kbd>K</Kbd.Kbd></Kbd.KbdGroup></p>
    <Tooltip.Tooltip><Tooltip.TooltipTrigger render={<Button.Button variant="outline" />}>Tooltip</Tooltip.TooltipTrigger><Tooltip.TooltipContent>Fixture tooltip</Tooltip.TooltipContent></Tooltip.Tooltip>
  </div>
}

function Fields() {
  return <div className="preview-stack">
    <Field.FieldGroup><Field.Field><Field.FieldLabel htmlFor="preview-name">Fixture name</Field.FieldLabel><Input.Input id="preview-name" placeholder="Enter a label" /><Field.FieldDescription>Only synthetic content belongs in this preview.</Field.FieldDescription></Field.Field><Field.Field data-invalid><Field.FieldLabel htmlFor="preview-invalid">Required label</Field.FieldLabel><Input.Input id="preview-invalid" aria-invalid aria-describedby="preview-error" /><Field.FieldError id="preview-error">Enter a label.</Field.FieldError></Field.Field></Field.FieldGroup>
    <Label.Label htmlFor="preview-disabled">Disabled input</Label.Label><Input.Input id="preview-disabled" disabled value="Unavailable" readOnly />
    <Label.Label htmlFor="preview-notes">Notes</Label.Label><Textarea.Textarea id="preview-notes" placeholder="Synthetic review notes" />
    <InputGroup.InputGroup><InputGroup.InputGroupAddon><SearchIcon /></InputGroup.InputGroupAddon><InputGroup.InputGroupInput aria-label="Search fixture records" placeholder="Search" /><InputGroup.InputGroupAddon align="inline-end"><InputGroup.InputGroupButton aria-label="Submit fixture search"><PlusIcon /></InputGroup.InputGroupButton></InputGroup.InputGroupAddon></InputGroup.InputGroup>
    <div className="preview-row"><Checkbox.Checkbox id="preview-check" defaultChecked /><Label.Label htmlFor="preview-check">Selected</Label.Label><Checkbox.Checkbox id="preview-check-disabled" disabled /><Label.Label htmlFor="preview-check-disabled">Disabled</Label.Label></div>
    <RadioGroup.RadioGroup defaultValue="one" aria-label="Fixture scope"><div className="preview-row"><RadioGroup.RadioGroupItem id="preview-radio-one" value="one" /><Label.Label htmlFor="preview-radio-one">One record</Label.Label><RadioGroup.RadioGroupItem id="preview-radio-all" value="all" /><Label.Label htmlFor="preview-radio-all">All records</Label.Label></div></RadioGroup.RadioGroup>
    <div className="preview-row"><Switch.Switch id="preview-switch" defaultChecked /><Label.Label htmlFor="preview-switch">Show details</Label.Label><Switch.Switch disabled aria-label="Unavailable setting" /></div>
    <Slider.Slider aria-label="Fixture range" defaultValue={[30, 70]} />
    <InputOtp.InputOTP maxLength={4} aria-label="Synthetic verification code"><InputOtp.InputOTPGroup>{[0, 1, 2, 3].map(index => <InputOtp.InputOTPSlot key={index} index={index} />)}</InputOtp.InputOTPGroup></InputOtp.InputOTP>
  </div>
}

function Choices() {
  return <div className="preview-stack">
    <NativeSelect.NativeSelect aria-label="Native fixture select" defaultValue="draft"><NativeSelect.NativeSelectOption value="draft">Draft</NativeSelect.NativeSelectOption><NativeSelect.NativeSelectOption value="ready">Ready</NativeSelect.NativeSelectOption><NativeSelect.NativeSelectOption disabled>Unavailable</NativeSelect.NativeSelectOption></NativeSelect.NativeSelect>
    <Select.Select defaultValue="draft"><Select.SelectTrigger aria-label="Fixture status"><Select.SelectValue /></Select.SelectTrigger><Select.SelectContent><Select.SelectGroup><Select.SelectLabel>Status</Select.SelectLabel><Select.SelectItem value="draft">Draft</Select.SelectItem><Select.SelectItem value="ready">Ready</Select.SelectItem><Select.SelectItem value="unavailable" disabled>Unavailable</Select.SelectItem></Select.SelectGroup></Select.SelectContent></Select.Select>
    <Combobox.Combobox items={["Draft", "Ready", "Archived"]}><Combobox.ComboboxInput aria-label="Find a fixture status" placeholder="Find status" /><Combobox.ComboboxContent><Combobox.ComboboxEmpty>No status found.</Combobox.ComboboxEmpty><Combobox.ComboboxList>{(item: string) => <Combobox.ComboboxItem key={item} value={item}>{item}</Combobox.ComboboxItem>}</Combobox.ComboboxList></Combobox.ComboboxContent></Combobox.Combobox>
    <Calendar.Calendar mode="single" defaultMonth={new Date(2026, 9, 1)} selected={new Date(2026, 9, 15)} disabled={new Date(2026, 9, 18)} />
  </div>
}

function Regions() {
  return <div className="preview-stack">
    <Card.Card><Card.CardHeader><Card.CardTitle>Fixture record</Card.CardTitle><Card.CardDescription>A neutral region with metadata.</Card.CardDescription></Card.CardHeader><Card.CardContent><p>Document, page, and date stay visible.</p></Card.CardContent><Card.CardFooter><Button.Button variant="secondary">View fixture</Button.Button></Card.CardFooter></Card.Card>
    <Item.ItemGroup><Item.Item><Item.ItemMedia><FileTextIcon /></Item.ItemMedia><Item.ItemContent><Item.ItemTitle>Synthetic document</Item.ItemTitle><Item.ItemDescription>Page 1 · October 15, 2026</Item.ItemDescription></Item.ItemContent></Item.Item><Item.ItemSeparator /><Item.Item><Item.ItemContent><Item.ItemTitle>Second fixture</Item.ItemTitle></Item.ItemContent></Item.Item></Item.ItemGroup>
    <Separator.Separator />
    <Avatar.AvatarGroup><Avatar.Avatar><Avatar.AvatarImage src="/brand/favicon.svg" alt="PatientGPT" /><Avatar.AvatarFallback>PG</Avatar.AvatarFallback></Avatar.Avatar><Avatar.Avatar><Avatar.AvatarFallback>AB</Avatar.AvatarFallback></Avatar.Avatar><Avatar.AvatarGroupCount>+2</Avatar.AvatarGroupCount></Avatar.AvatarGroup>
    <AspectRatio.AspectRatio ratio={16 / 9}><div className="preview-image"><img src="/brand/wordmark-light.svg" className="dark:hidden" alt="PatientGPT brand fixture" /><img src="/brand/wordmark-dark.svg" className="hidden dark:block" alt="PatientGPT brand fixture" /></div></AspectRatio.AspectRatio>
  </div>
}

function Feedback() {
  return <div className="preview-stack">
    <Alert.Alert><Alert.AlertTitle>Source attached</Alert.AlertTitle><Alert.AlertDescription>Synthetic document · page 1 · October 15, 2026.</Alert.AlertDescription></Alert.Alert>
    <Alert.Alert variant="destructive"><Alert.AlertTitle>Source missing</Alert.AlertTitle><Alert.AlertDescription>This assertion has no source document. It will not be included.</Alert.AlertDescription></Alert.Alert>
    <div className="preview-row"><StateChip state="met" label="Met" /><StateChip state="gap" label="Gap" /><StateChip state="void" label="Void" /></div>
    <Progress.Progress value={60}><Progress.ProgressLabel>Fixture progress</Progress.ProgressLabel><Progress.ProgressValue /></Progress.Progress>
    <div role="status" className="preview-row"><Spinner.Spinner /><span>Loading fixture</span></div><Skeleton.Skeleton className="h-5 w-2/3" /><Skeleton.Skeleton className="h-5 w-1/2" />
    <Empty.Empty><Empty.EmptyHeader><Empty.EmptyTitle>No fixture records</Empty.EmptyTitle><Empty.EmptyDescription>Change the filter to show records.</Empty.EmptyDescription></Empty.EmptyHeader></Empty.Empty>
    <div className="preview-row">{["success", "info", "warning", "error", "loading"].map(type => <Button.Button key={type} variant="secondary" onClick={() => Toast.toast.add({ title: `${type} fixture`, description: "Synthetic notification", type })}>{type} toast</Button.Button>)}</div>
  </div>
}

function Disclosure() {
  return <div className="preview-stack">
    <Accordion.Accordion defaultValue={["details"]}><Accordion.AccordionItem value="details"><Accordion.AccordionTrigger>Record details</Accordion.AccordionTrigger><Accordion.AccordionContent>Synthetic document · page 1 · October 15, 2026.</Accordion.AccordionContent></Accordion.AccordionItem><Accordion.AccordionItem value="disabled" disabled><Accordion.AccordionTrigger>Unavailable details</Accordion.AccordionTrigger><Accordion.AccordionContent>Unavailable</Accordion.AccordionContent></Accordion.AccordionItem></Accordion.Accordion>
    <Collapsible.Collapsible><Collapsible.CollapsibleTrigger render={<Button.Button variant="secondary" />}>Toggle disclosure</Collapsible.CollapsibleTrigger><Collapsible.CollapsibleContent>Expanded fixture content.</Collapsible.CollapsibleContent></Collapsible.Collapsible>
    {(["default", "line"] as const).map(variant => <Tabs.Tabs key={variant} defaultValue="one"><Tabs.TabsList variant={variant}><Tabs.TabsTrigger value="one">Overview</Tabs.TabsTrigger><Tabs.TabsTrigger value="two">Details</Tabs.TabsTrigger><Tabs.TabsTrigger value="three" disabled>Later</Tabs.TabsTrigger></Tabs.TabsList><Tabs.TabsContent value="one">{variant} tabs overview</Tabs.TabsContent><Tabs.TabsContent value="two">Synthetic details</Tabs.TabsContent></Tabs.Tabs>)}
  </div>
}

function Overlays() {
  return <div className="preview-row">
    <Dialog.Dialog><Dialog.DialogTrigger render={<Button.Button />}>Open dialog</Dialog.DialogTrigger><Dialog.DialogContent><Dialog.DialogHeader><Dialog.DialogTitle>Fixture dialog</Dialog.DialogTitle><Dialog.DialogDescription>Check focus trapping, Escape, and focus restoration.</Dialog.DialogDescription></Dialog.DialogHeader><Input.Input aria-label="Dialog label" placeholder="Fixture label" /><Dialog.DialogFooter><Dialog.DialogClose render={<Button.Button variant="secondary" />}>Done</Dialog.DialogClose></Dialog.DialogFooter></Dialog.DialogContent></Dialog.Dialog>
    <AlertDialog.AlertDialog><AlertDialog.AlertDialogTrigger render={<Button.Button variant="destructive" />}>Open alert</AlertDialog.AlertDialogTrigger><AlertDialog.AlertDialogContent><AlertDialog.AlertDialogHeader><AlertDialog.AlertDialogTitle>Discard fixture?</AlertDialog.AlertDialogTitle><AlertDialog.AlertDialogDescription>This preview action has no persistent effect.</AlertDialog.AlertDialogDescription></AlertDialog.AlertDialogHeader><AlertDialog.AlertDialogFooter><AlertDialog.AlertDialogCancel>Cancel</AlertDialog.AlertDialogCancel><AlertDialog.AlertDialogAction>Discard</AlertDialog.AlertDialogAction></AlertDialog.AlertDialogFooter></AlertDialog.AlertDialogContent></AlertDialog.AlertDialog>
    <Sheet.Sheet><Sheet.SheetTrigger render={<Button.Button variant="secondary" />}>Open sheet</Sheet.SheetTrigger><Sheet.SheetContent><Sheet.SheetHeader><Sheet.SheetTitle>Fixture sheet</Sheet.SheetTitle><Sheet.SheetDescription>Responsive side panel.</Sheet.SheetDescription></Sheet.SheetHeader><Sheet.SheetFooter><Sheet.SheetClose render={<Button.Button />}>Close</Sheet.SheetClose></Sheet.SheetFooter></Sheet.SheetContent></Sheet.Sheet>
    <Drawer.Drawer><Drawer.DrawerTrigger render={<Button.Button variant="secondary" />}>Open drawer</Drawer.DrawerTrigger><Drawer.DrawerContent><Drawer.DrawerHeader><Drawer.DrawerTitle>Fixture drawer</Drawer.DrawerTitle><Drawer.DrawerDescription>Check touch dismissal and focus restoration.</Drawer.DrawerDescription></Drawer.DrawerHeader><Drawer.DrawerFooter><Drawer.DrawerClose render={<Button.Button />}>Close</Drawer.DrawerClose></Drawer.DrawerFooter></Drawer.DrawerContent></Drawer.Drawer>
    <Popover.Popover><Popover.PopoverTrigger render={<Button.Button variant="outline" />}>Open popover</Popover.PopoverTrigger><Popover.PopoverContent><Popover.PopoverHeader><Popover.PopoverTitle>Fixture popover</Popover.PopoverTitle><Popover.PopoverDescription>Interactive overlay.</Popover.PopoverDescription></Popover.PopoverHeader><Button.Button variant="secondary">Fixture action</Button.Button></Popover.PopoverContent></Popover.Popover>
    <HoverCard.HoverCard><HoverCard.HoverCardTrigger render={<a href="#regions" />}>Hover or focus card</HoverCard.HoverCardTrigger><HoverCard.HoverCardContent>Synthetic document · page 1 · October 15, 2026.</HoverCard.HoverCardContent></HoverCard.HoverCard>
  </div>
}

function Menus() {
  return <div className="preview-stack">
    <DropdownMenu.DropdownMenu><DropdownMenu.DropdownMenuTrigger render={<Button.Button variant="secondary" />}>Open menu</DropdownMenu.DropdownMenuTrigger><DropdownMenu.DropdownMenuContent><DropdownMenu.DropdownMenuGroup><DropdownMenu.DropdownMenuLabel>Fixture actions</DropdownMenu.DropdownMenuLabel><DropdownMenu.DropdownMenuItem>View details</DropdownMenu.DropdownMenuItem><DropdownMenu.DropdownMenuCheckboxItem defaultChecked>Show metadata</DropdownMenu.DropdownMenuCheckboxItem><DropdownMenu.DropdownMenuSeparator /><DropdownMenu.DropdownMenuItem variant="destructive">Remove fixture</DropdownMenu.DropdownMenuItem><DropdownMenu.DropdownMenuItem disabled>Unavailable</DropdownMenu.DropdownMenuItem></DropdownMenu.DropdownMenuGroup></DropdownMenu.DropdownMenuContent></DropdownMenu.DropdownMenu>
    <ContextMenu.ContextMenu><ContextMenu.ContextMenuTrigger className="preview-context" tabIndex={0}>Right click or long press this fixture</ContextMenu.ContextMenuTrigger><ContextMenu.ContextMenuContent><ContextMenu.ContextMenuItem>Open fixture</ContextMenu.ContextMenuItem><ContextMenu.ContextMenuCheckboxItem defaultChecked>Selected</ContextMenu.ContextMenuCheckboxItem><ContextMenu.ContextMenuItem disabled>Unavailable</ContextMenu.ContextMenuItem></ContextMenu.ContextMenuContent></ContextMenu.ContextMenu>
    <Menubar.Menubar><Menubar.MenubarMenu><Menubar.MenubarTrigger>File</Menubar.MenubarTrigger><Menubar.MenubarContent><Menubar.MenubarItem>New fixture</Menubar.MenubarItem><Menubar.MenubarSeparator /><Menubar.MenubarItem disabled>Export</Menubar.MenubarItem></Menubar.MenubarContent></Menubar.MenubarMenu><Menubar.MenubarMenu><Menubar.MenubarTrigger>View</Menubar.MenubarTrigger><Menubar.MenubarContent><Menubar.MenubarCheckboxItem defaultChecked>Show labels</Menubar.MenubarCheckboxItem></Menubar.MenubarContent></Menubar.MenubarMenu></Menubar.Menubar>
    <Command.Command><Command.CommandInput placeholder="Search fixture commands" /><Command.CommandList><Command.CommandEmpty>No commands found.</Command.CommandEmpty><Command.CommandGroup heading="Fixtures"><Command.CommandItem>Open record<Command.CommandShortcut>⌘O</Command.CommandShortcut></Command.CommandItem><Command.CommandItem>Show metadata</Command.CommandItem><Command.CommandItem disabled>Unavailable</Command.CommandItem></Command.CommandGroup></Command.CommandList></Command.Command>
  </div>
}

function Navigation() {
  return <div className="preview-stack">
    <Breadcrumb.Breadcrumb><Breadcrumb.BreadcrumbList><Breadcrumb.BreadcrumbItem><Breadcrumb.BreadcrumbLink href="#navigation">Library</Breadcrumb.BreadcrumbLink></Breadcrumb.BreadcrumbItem><Breadcrumb.BreadcrumbSeparator /><Breadcrumb.BreadcrumbItem><Breadcrumb.BreadcrumbPage>Fixture</Breadcrumb.BreadcrumbPage></Breadcrumb.BreadcrumbItem></Breadcrumb.BreadcrumbList></Breadcrumb.Breadcrumb>
    <NavigationMenu.NavigationMenu><NavigationMenu.NavigationMenuList><NavigationMenu.NavigationMenuItem><NavigationMenu.NavigationMenuTrigger>Browse</NavigationMenu.NavigationMenuTrigger><NavigationMenu.NavigationMenuContent><NavigationMenu.NavigationMenuLink href="#fields">Fields</NavigationMenu.NavigationMenuLink><NavigationMenu.NavigationMenuLink href="#feedback">Feedback</NavigationMenu.NavigationMenuLink></NavigationMenu.NavigationMenuContent></NavigationMenu.NavigationMenuItem></NavigationMenu.NavigationMenuList></NavigationMenu.NavigationMenu>
    <Pagination.Pagination><Pagination.PaginationContent><Pagination.PaginationItem><Pagination.PaginationPrevious href="#navigation" /></Pagination.PaginationItem><Pagination.PaginationItem><Pagination.PaginationLink href="#navigation" isActive>1</Pagination.PaginationLink></Pagination.PaginationItem><Pagination.PaginationItem><Pagination.PaginationLink href="#navigation">2</Pagination.PaginationLink></Pagination.PaginationItem><Pagination.PaginationItem><Pagination.PaginationNext href="#navigation" /></Pagination.PaginationItem></Pagination.PaginationContent></Pagination.Pagination>
    <Direction.DirectionProvider direction="rtl"><div dir="rtl"><Button.Button variant="secondary">اتجاه القراءة</Button.Button></div></Direction.DirectionProvider>
    <Sidebar.SidebarProvider className="preview-sidebar"><Sidebar.Sidebar collapsible="none"><Sidebar.SidebarHeader><Sidebar.SidebarInput aria-label="Find sidebar fixtures" placeholder="Find fixture" /></Sidebar.SidebarHeader><Sidebar.SidebarContent><Sidebar.SidebarGroup><Sidebar.SidebarGroupLabel>Fixtures</Sidebar.SidebarGroupLabel><Sidebar.SidebarMenu><Sidebar.SidebarMenuItem><Sidebar.SidebarMenuButton isActive>Overview</Sidebar.SidebarMenuButton><Sidebar.SidebarMenuBadge>3</Sidebar.SidebarMenuBadge></Sidebar.SidebarMenuItem><Sidebar.SidebarMenuItem><Sidebar.SidebarMenuButton>Files</Sidebar.SidebarMenuButton></Sidebar.SidebarMenuItem><Sidebar.SidebarMenuItem><Sidebar.SidebarMenuSkeleton /></Sidebar.SidebarMenuItem></Sidebar.SidebarMenu></Sidebar.SidebarGroup></Sidebar.SidebarContent></Sidebar.Sidebar></Sidebar.SidebarProvider>
  </div>
}

function DataDisplays() {
  return <div className="preview-stack">
    <Table.Table><Table.TableCaption>Synthetic fixture counts.</Table.TableCaption><Table.TableHeader><Table.TableRow><Table.TableHead>State</Table.TableHead><Table.TableHead>Count</Table.TableHead></Table.TableRow></Table.TableHeader><Table.TableBody>{([ { state: "met", label: "Met", count: 6 }, { state: "gap", label: "Gap", count: 2 }, { state: "void", label: "Void", count: 3 } ] as const).map(({ state, label, count }) => <Table.TableRow key={state}><Table.TableCell><StateChip state={state} label={label} /></Table.TableCell><Table.TableCell>{count}</Table.TableCell></Table.TableRow>)}</Table.TableBody></Table.Table>
    <Chart.ChartContainer config={{ documents: { label: "Documents", color: "var(--chart-1)" }, notes: { label: "Notes", color: "var(--chart-2)" } }} className="h-64 w-full"><BarChart accessibilityLayer data={[{ week: "One", documents: 4, notes: 3 }, { week: "Two", documents: 6, notes: 4 }, { week: "Three", documents: 8, notes: 5 }]}><CartesianGrid vertical={false} /><XAxis dataKey="week" /><Chart.ChartTooltip content={<Chart.ChartTooltipContent />} /><Chart.ChartLegend content={<Chart.ChartLegendContent />} /><Bar dataKey="documents" fill="var(--color-documents)" radius={4} /><Bar dataKey="notes" fill="var(--color-notes)" radius={0} /></BarChart></Chart.ChartContainer>
    <ScrollArea.ScrollArea className="h-36"><div className="preview-stack">{Array.from({ length: 8 }, (_, index) => <p key={index}>Scrollable fixture {index + 1}</p>)}</div></ScrollArea.ScrollArea>
    <Resizable.ResizablePanelGroup orientation="horizontal" className="preview-resize"><Resizable.ResizablePanel defaultSize="50%" minSize="25%"><div className="preview-pane">First region</div></Resizable.ResizablePanel><Resizable.ResizableHandle withHandle /><Resizable.ResizablePanel defaultSize="50%" minSize="25%"><div className="preview-pane">Second region</div></Resizable.ResizablePanel></Resizable.ResizablePanelGroup>
    <Carousel.Carousel className="preview-carousel"><Carousel.CarouselContent>{[1, 2, 3].map(number => <Carousel.CarouselItem key={number}><div className="preview-pane">Slide {number}</div></Carousel.CarouselItem>)}</Carousel.CarouselContent><Carousel.CarouselPrevious /><Carousel.CarouselNext /></Carousel.Carousel>
  </div>
}

function ChatPrimitives() {
  const code = 'const state = "void";'
  const highlighted = useHighlightedCode(code, "typescript")
  return <div className="preview-stack">
    <Message.MessageGroup><Message.Message><Message.MessageAvatar><Avatar.Avatar><Avatar.AvatarFallback>PG</Avatar.AvatarFallback></Avatar.Avatar></Message.MessageAvatar><Message.MessageContent><Message.MessageHeader>PatientGPT fixture</Message.MessageHeader><Bubble.BubbleGroup><Bubble.Bubble><Bubble.BubbleContent>Plain synthetic response.</Bubble.BubbleContent></Bubble.Bubble></Bubble.BubbleGroup><Message.MessageFooter>Preview content only</Message.MessageFooter></Message.MessageContent></Message.Message></Message.MessageGroup>
    <Attachment.AttachmentGroup><Attachment.Attachment><Attachment.AttachmentMedia><FileTextIcon /></Attachment.AttachmentMedia><Attachment.AttachmentContent><Attachment.AttachmentTitle>synthetic-document.txt</Attachment.AttachmentTitle><Attachment.AttachmentDescription>Text · 64 bytes</Attachment.AttachmentDescription></Attachment.AttachmentContent><Attachment.AttachmentActions><Attachment.AttachmentAction aria-label="Open synthetic attachment"><PlusIcon /></Attachment.AttachmentAction></Attachment.AttachmentActions></Attachment.Attachment></Attachment.AttachmentGroup>
    {(["default", "separator", "border"] as const).map(variant => <Marker.Marker key={variant} variant={variant}><Marker.MarkerIcon><FileTextIcon /></Marker.MarkerIcon><Marker.MarkerContent>{variant} marker</Marker.MarkerContent></Marker.Marker>)}
    <Trace.Trace><Trace.TraceLine><Trace.TraceIcon><FileTextIcon /></Trace.TraceIcon><Trace.TraceTitle>Read fixture</Trace.TraceTitle><Trace.TraceDescription>Completed</Trace.TraceDescription></Trace.TraceLine><Trace.TraceCollapsible><Trace.TraceCollapsibleTrigger>Show trace details</Trace.TraceCollapsibleTrigger><Trace.TraceCollapsibleContent>Local synthetic content. No tool was executed.</Trace.TraceCollapsibleContent></Trace.TraceCollapsible></Trace.Trace>
    <CodeBlock.CodeBlock><CodeBlock.CodeBlockHeader><CodeBlock.CodeBlockTitle>Fixture code</CodeBlock.CodeBlockTitle><CodeBlock.CodeBlockActions><CodeBlock.CodeBlockCopyButton value={code} /></CodeBlock.CodeBlockActions></CodeBlock.CodeBlockHeader><CodeBlock.CodeBlockContent lineNumbers>{highlighted.map((line, index) => <CodeBlock.CodeBlockLine key={index}>{line}</CodeBlock.CodeBlockLine>)}</CodeBlock.CodeBlockContent></CodeBlock.CodeBlock>
    <div className="preview-scroller"><MessageScroller.MessageScrollerProvider defaultScrollPosition="start"><MessageScroller.MessageScroller><MessageScroller.MessageScrollerViewport aria-label="Synthetic message history"><MessageScroller.MessageScrollerContent>{Array.from({ length: 8 }, (_, index) => <MessageScroller.MessageScrollerItem key={index} messageId={`fixture-${index}`}><p>Synthetic message {index + 1}. Scroll to check the end control.</p></MessageScroller.MessageScrollerItem>)}</MessageScroller.MessageScrollerContent></MessageScroller.MessageScrollerViewport><MessageScroller.MessageScrollerButton /></MessageScroller.MessageScroller></MessageScroller.MessageScrollerProvider></div>
  </div>
}

function Questions() {
  const [submitted, setSubmitted] = useState(false)
  return <Questionnaire.Questionnaire onSubmit={event => { event.preventDefault(); setSubmitted(true) }}><Questionnaire.QuestionnaireProgress /><Questionnaire.QuestionnaireItem name="layout" required><Questionnaire.QuestionnaireTitle>Choose a fixture layout</Questionnaire.QuestionnaireTitle><Questionnaire.QuestionnaireDescription>This choice changes no application data.</Questionnaire.QuestionnaireDescription><Questionnaire.QuestionnaireChoices><Questionnaire.QuestionnaireChoice value="compact">Compact<Questionnaire.QuestionnaireChoiceDescription>Show more records.</Questionnaire.QuestionnaireChoiceDescription></Questionnaire.QuestionnaireChoice><Questionnaire.QuestionnaireChoice value="comfortable">Comfortable</Questionnaire.QuestionnaireChoice><Questionnaire.QuestionnaireChoice value="disabled" disabled>Unavailable</Questionnaire.QuestionnaireChoice></Questionnaire.QuestionnaireChoices><Questionnaire.QuestionnaireError>Choose a layout.</Questionnaire.QuestionnaireError></Questionnaire.QuestionnaireItem><Questionnaire.QuestionnaireItem name="label"><Questionnaire.QuestionnaireTitle>Label the fixture</Questionnaire.QuestionnaireTitle><Questionnaire.QuestionnaireInput aria-label="Questionnaire fixture label" /></Questionnaire.QuestionnaireItem><Questionnaire.QuestionnaireActions><Questionnaire.QuestionnairePrevious>Previous</Questionnaire.QuestionnairePrevious><Questionnaire.QuestionnaireSkip>Skip</Questionnaire.QuestionnaireSkip><Questionnaire.QuestionnaireNext>Next</Questionnaire.QuestionnaireNext><Questionnaire.QuestionnaireSubmit>Finish fixture</Questionnaire.QuestionnaireSubmit></Questionnaire.QuestionnaireActions>{submitted && <p role="status">Fixture completed.</p>}</Questionnaire.Questionnaire>
}

export const uiFixtures: PreviewFixture[] = [
  { id: "actions", title: "Actions and labels", modules: ["button", "badge", "button-group", "toggle", "toggle-group", "kbd", "tooltip"], states: "Variants, sizes, selected, disabled, icon, hover tooltip", Component: Actions },
  { id: "fields", title: "Fields and selection", modules: ["field", "input", "label", "textarea", "input-group", "checkbox", "radio-group", "switch", "slider", "input-otp"], states: "Empty, filled, invalid, disabled, checked, ranged, partial code", Component: Fields },
  { id: "choices", title: "Choices and calendar", modules: ["native-select", "select", "combobox", "calendar"], states: "Selected, disabled option, search empty, date selected and disabled", Component: Choices },
  { id: "regions", title: "Regions and identity", modules: ["card", "item", "separator", "avatar", "aspect-ratio"], states: "Header, footer, metadata, fallback avatar, image", Component: Regions },
  { id: "feedback", title: "Feedback and evidence states", modules: ["alert", "progress", "spinner", "skeleton", "empty", "toast"], states: "Informative, destructive, met/gap/void labels and shapes, progress, loading, empty, five toast types", Component: Feedback },
  { id: "disclosure", title: "Disclosure and tabs", modules: ["accordion", "collapsible", "tabs"], states: "Expanded, collapsed, disabled, default and line tabs", Component: Disclosure },
  { id: "overlays", title: "Dialogs and overlays", modules: ["dialog", "alert-dialog", "sheet", "drawer", "popover", "hover-card"], states: "Open each trigger; keyboard focus, Escape, restoration, hover and touch", Component: Overlays },
  { id: "menus", title: "Menus and commands", modules: ["dropdown-menu", "context-menu", "menubar", "command"], states: "Open, checked, destructive, disabled, command search empty", Component: Menus },
  { id: "navigation", title: "Navigation and direction", modules: ["breadcrumb", "navigation-menu", "pagination", "direction", "sidebar"], states: "Current page, menu overlay, selected sidebar, skeleton, right-to-left", Component: Navigation },
  { id: "data", title: "Data and layout", modules: ["table", "chart", "scroll-area", "resizable", "carousel"], states: "Labeled table, chart tooltip and legend, scroll, resize, first and last slides", Component: DataDisplays },
  { id: "chat", title: "Chat primitives", modules: ["message", "bubble", "attachment", "marker", "trace", "code-block", "message-scroller"], states: "Avatar, prose, attachment action, three marker variants, disclosure, code copy, scroll controls", Component: ChatPrimitives },
  { id: "questions", title: "Questionnaire", modules: ["questionnaire"], states: "Two steps, required and disabled choices, next, previous, skip, submit", Component: Questions },
]
