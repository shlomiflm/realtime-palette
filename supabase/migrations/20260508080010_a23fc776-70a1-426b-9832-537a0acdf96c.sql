
-- Roles enum
CREATE TYPE public.board_role AS ENUM ('owner','editor','viewer');

-- Profiles
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name TEXT NOT NULL,
  color TEXT NOT NULL DEFAULT '#6366f1',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "profiles readable by authed" ON public.profiles FOR SELECT TO authenticated USING (true);
CREATE POLICY "users update own profile" ON public.profiles FOR UPDATE TO authenticated USING (auth.uid() = id);
CREATE POLICY "users insert own profile" ON public.profiles FOR INSERT TO authenticated WITH CHECK (auth.uid() = id);

-- Boards
CREATE TABLE public.boards (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title TEXT NOT NULL DEFAULT 'Untitled board',
  template TEXT,
  is_public BOOLEAN NOT NULL DEFAULT false,
  yjs_state BYTEA,
  thumbnail_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.boards ENABLE ROW LEVEL SECURITY;

-- Board members
CREATE TABLE public.board_members (
  board_id UUID NOT NULL REFERENCES public.boards(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.board_role NOT NULL DEFAULT 'editor',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (board_id, user_id)
);
ALTER TABLE public.board_members ENABLE ROW LEVEL SECURITY;

-- Security definer helpers (avoid recursive RLS)
CREATE OR REPLACE FUNCTION public.get_board_role(_board UUID, _user UUID)
RETURNS public.board_role LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT role FROM public.board_members WHERE board_id=_board AND user_id=_user
$$;

CREATE OR REPLACE FUNCTION public.can_view_board(_board UUID, _user UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT EXISTS (SELECT 1 FROM public.boards b WHERE b.id=_board AND (b.is_public OR b.owner_id=_user))
      OR EXISTS (SELECT 1 FROM public.board_members WHERE board_id=_board AND user_id=_user)
$$;

CREATE OR REPLACE FUNCTION public.can_edit_board(_board UUID, _user UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT EXISTS (SELECT 1 FROM public.boards b WHERE b.id=_board AND b.owner_id=_user)
      OR EXISTS (SELECT 1 FROM public.board_members WHERE board_id=_board AND user_id=_user AND role IN ('owner','editor'))
$$;

-- Boards policies
CREATE POLICY "view boards" ON public.boards FOR SELECT TO authenticated
  USING (is_public OR owner_id = auth.uid() OR public.get_board_role(id, auth.uid()) IS NOT NULL);
CREATE POLICY "create boards" ON public.boards FOR INSERT TO authenticated WITH CHECK (owner_id = auth.uid());
CREATE POLICY "owner update board" ON public.boards FOR UPDATE TO authenticated
  USING (owner_id = auth.uid() OR public.get_board_role(id, auth.uid()) IN ('owner','editor'));
CREATE POLICY "owner delete board" ON public.boards FOR DELETE TO authenticated USING (owner_id = auth.uid());

-- Members policies
CREATE POLICY "view members of accessible boards" ON public.board_members FOR SELECT TO authenticated
  USING (public.can_view_board(board_id, auth.uid()));
CREATE POLICY "owner manages members" ON public.board_members FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.boards WHERE id=board_id AND owner_id=auth.uid()) OR user_id = auth.uid());
CREATE POLICY "owner updates members" ON public.board_members FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.boards WHERE id=board_id AND owner_id=auth.uid()));
CREATE POLICY "owner removes members" ON public.board_members FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.boards WHERE id=board_id AND owner_id=auth.uid()) OR user_id = auth.uid());

-- Comments pinned to coordinates
CREATE TABLE public.comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  board_id UUID NOT NULL REFERENCES public.boards(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  parent_id UUID REFERENCES public.comments(id) ON DELETE CASCADE,
  x DOUBLE PRECISION NOT NULL DEFAULT 0,
  y DOUBLE PRECISION NOT NULL DEFAULT 0,
  body TEXT NOT NULL,
  resolved BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.comments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "view comments" ON public.comments FOR SELECT TO authenticated
  USING (public.can_view_board(board_id, auth.uid()));
CREATE POLICY "post comments" ON public.comments FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid() AND public.can_view_board(board_id, auth.uid()));
CREATE POLICY "edit own comments" ON public.comments FOR UPDATE TO authenticated USING (user_id = auth.uid());
CREATE POLICY "delete own comments" ON public.comments FOR DELETE TO authenticated USING (user_id = auth.uid());

-- Chat messages
CREATE TABLE public.chat_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  board_id UUID NOT NULL REFERENCES public.boards(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  body TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.chat_messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "view chat" ON public.chat_messages FOR SELECT TO authenticated
  USING (public.can_view_board(board_id, auth.uid()));
CREATE POLICY "post chat" ON public.chat_messages FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid() AND public.can_edit_board(board_id, auth.uid()));

-- Snapshots
CREATE TABLE public.snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  board_id UUID NOT NULL REFERENCES public.boards(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  storage_path TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.snapshots ENABLE ROW LEVEL SECURITY;
CREATE POLICY "view snapshots" ON public.snapshots FOR SELECT TO authenticated
  USING (public.can_view_board(board_id, auth.uid()));
CREATE POLICY "create snapshots" ON public.snapshots FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid() AND public.can_edit_board(board_id, auth.uid()));

-- Auto-update updated_at on boards
CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END $$;
CREATE TRIGGER trg_boards_updated BEFORE UPDATE ON public.boards
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- Auto profile + add owner as member on board create
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE
  colors TEXT[] := ARRAY['#ef4444','#f97316','#eab308','#22c55e','#06b6d4','#3b82f6','#8b5cf6','#ec4899'];
BEGIN
  INSERT INTO public.profiles (id, display_name, color)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'display_name', split_part(NEW.email,'@',1)),
          colors[1 + (floor(random()*8))::int])
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END $$;
CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

CREATE OR REPLACE FUNCTION public.add_owner_member()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  INSERT INTO public.board_members(board_id, user_id, role) VALUES (NEW.id, NEW.owner_id, 'owner')
  ON CONFLICT DO NOTHING;
  RETURN NEW;
END $$;
CREATE TRIGGER trg_board_owner_member AFTER INSERT ON public.boards
  FOR EACH ROW EXECUTE FUNCTION public.add_owner_member();

-- Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.chat_messages;
ALTER PUBLICATION supabase_realtime ADD TABLE public.comments;
ALTER PUBLICATION supabase_realtime ADD TABLE public.board_members;

-- Storage bucket
INSERT INTO storage.buckets (id, name, public) VALUES ('board-snapshots','board-snapshots', true)
  ON CONFLICT (id) DO NOTHING;
CREATE POLICY "snapshots public read" ON storage.objects FOR SELECT TO public USING (bucket_id='board-snapshots');
CREATE POLICY "snapshots authed write" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id='board-snapshots' AND auth.uid() IS NOT NULL);
